"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { browserClient } from "@/lib/supabase/client";
import { parseStoredPlace } from "@/lib/journey";
import type { MapPoint } from "@/lib/destination";
import { refreshNavigationRoute } from "@/lib/navigation";
import { detectTwa, trackingIntentUrl } from "@/lib/twa";
import {
  shouldShareFix, shareParams, shareableFix, locationFreshness, ageLabel, etaMinutes,
  type LiveLocation, type SharedFix,
} from "@/lib/live-location";

const JourneyMap = dynamic(() => import("./journey-map"), { ssr: false });

export type SharingState = "idle" | "starting" | "weak" | "sharing" | "denied" | "unavailable" | "offline" | "error";

/** Comparte la posición del conductor mientras tiene un viaje activo y la app está abierta. */
export function useDriverLocationSharing(tripId: string | null) {
  const client = useMemo(() => browserClient(), []);
  const [state, setState] = useState<SharingState>("idle");
  const [lastSent, setLastSent] = useState<number | null>(null);
  useEffect(() => {
    if (!tripId) { setState("idle"); setLastSent(null); return; }
    if (!navigator.geolocation) { setState("unavailable"); return; }
    let alive = true, sending = false, stopped = false;
    let previous: { point: MapPoint; at: number } | null = null;
    let pendingFix: SharedFix | null = null;
    setState(navigator.onLine ? "starting" : "offline");
    const send = async (fix: SharedFix) => {
      if (sending || stopped) { pendingFix = fix; return; }
      if (!navigator.onLine) { setState("offline"); pendingFix = fix; return; }
      sending = true;
      const now = Date.now();
      try {
        // La hora la pone el servidor: evita rechazos si el reloj del teléfono está desfasado.
        const { error } = await client.rpc("share_location", { ...shareParams(tripId, fix), recorded_at: null });
        if (!alive) return;
        if (error) {
          // Viaje terminado, o la función aún no existe en la base (migración pendiente): se detiene sin alarmar.
          if (error.message?.includes("ya no comparte") || error.code === "PGRST202" || error.code === "42883") { stopped = true; setState("idle"); return; }
          setState("error");
          return;
        }
        previous = { point: { lat: fix.lat, lng: fix.lng }, at: now };
        setLastSent(now);
        setState("sharing");
      } catch {
        if (alive) setState(navigator.onLine ? "error" : "offline");
      } finally {
        sending = false;
        const next = pendingFix;
        pendingFix = null;
        if (alive && next && next !== fix && shouldShareFix(previous, next, Date.now())) void send(next);
      }
    };
    const watch = navigator.geolocation.watchPosition(
      (position) => {
        if (!alive) return;
        const fix: SharedFix = {
          lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy,
          timestamp: position.timestamp, heading: position.coords.heading, speed: position.coords.speed,
        };
        const now = Date.now();
        if (!shareableFix(fix, now)) { if (!previous) setState("weak"); return; }
        if (shouldShareFix(previous, fix, now)) void send(fix);
      },
      (error) => { if (alive) setState(error.code === 1 ? "denied" : "weak"); },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    const online = () => { if (!alive) return; setState(navigator.onLine ? "starting" : "offline"); previous = null; };
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    return () => {
      alive = false;
      navigator.geolocation.clearWatch(watch);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
    };
  }, [client, tripId]);
  // Dentro de la app Android: token de seguimiento para el servicio nativo (sigue con la pantalla apagada).
  const [twa, setTwa] = useState(false);
  const [backgroundToken, setBackgroundToken] = useState<string | null>(null);
  const [backgroundActive, setBackgroundActive] = useState(false);
  useEffect(() => { setTwa(detectTwa()); }, []);
  useEffect(() => {
    setBackgroundToken(null); setBackgroundActive(false);
    if (!twa || !tripId) return;
    let alive = true;
    void client.rpc("issue_tracking_token", { trip_id: tripId }).then(({ data, error }) => {
      if (alive && !error && typeof data === "string") setBackgroundToken(data);
    });
    return () => { alive = false; };
  }, [client, twa, tripId]);
  const startBackground = () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!backgroundToken || !url || !key) return;
    // Debe ejecutarse dentro del toque del usuario: Chrome solo abre apps con un gesto.
    window.location.href = trackingIntentUrl("start", { token: backgroundToken, url, key });
    setBackgroundActive(true);
  };
  const background = twa && tripId ? { ready: !!backgroundToken, active: backgroundActive, start: startBackground } : null;
  return { state, lastSent, background };
}

const sharingCopy: Record<SharingState, string> = {
  idle: "",
  starting: "Activando tu ubicación para el pasajero…",
  weak: "Buscando señal GPS. Sal a un lugar abierto si tarda.",
  sharing: "Tu pasajero ve tu ubicación en tiempo real.",
  denied: "Permite el acceso a tu ubicación para que el pasajero pueda verte llegar.",
  unavailable: "Este dispositivo no permite compartir la ubicación.",
  offline: "Sin conexión. Tu ubicación se enviará al reconectar.",
  error: "No pudimos enviar tu ubicación. Seguimos intentando.",
};

export function DriverSharingStatus({ state, background }: { state: SharingState; background?: { ready: boolean; active: boolean; start: () => void } | null }) {
  if (state === "idle" && !background) return null;
  const ok = state === "sharing";
  if (background) {
    return (
      <div className={"sharing-status sharing-background " + (background.active ? "is-ok" : "is-warning")} role="status">
        <i aria-hidden="true" />
        {background.active ? "Ubicación activa también con la pantalla apagada." : "Para que el pasajero te siga viendo con la app minimizada, actívala en segundo plano."}
        <small>{background.active ? "Verás un aviso fijo de De1na mientras dure el viaje. Se desactiva solo al terminar." : sharingCopy[state] || ""}</small>
        <button type="button" className={background.active ? "secondary" : "primary"} disabled={!background.ready} onClick={background.start}>
          {background.active ? "Reactivar" : background.ready ? "Mantener ubicación activa" : "Preparando…"}
        </button>
      </div>
    );
  }
  return (
    <p className={"sharing-status " + (ok ? "is-ok" : state === "starting" ? "" : "is-warning")} role="status">
      <i aria-hidden="true" />
      {sharingCopy[state]}
      {ok && <small>Mantén la app abierta durante el viaje.</small>}
    </p>
  );
}

/** Última posición del conductor de un viaje (Realtime + respaldo periódico). tripId null = inactivo. */
export function useTripLiveLocation(tripId: string | null) {
  const client = useMemo(() => browserClient(), []);
  const [location, setLocation] = useState<LiveLocation | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setLocation(null); setLoaded(false);
    if (!tripId) return;
    let alive = true, version = 0;
    const accept = (row: LiveLocation | null) => {
      if (!alive) return;
      setLoaded(true);
      setLocation((current) => (row && current && Date.parse(row.recorded_at) < Date.parse(current.recorded_at) ? current : row));
    };
    const load = async () => {
      const request = ++version;
      const { data, error } = await client
        .from("trip_locations")
        .select("trip_id,latitude,longitude,accuracy,heading,speed,recorded_at")
        .eq("trip_id", tripId)
        .maybeSingle();
      if (!alive || request !== version) return;
      if (error) {
        // Tabla aún no creada (migración pendiente): se oculta la función en lugar de mostrar un error.
        if (error.code === "PGRST205" || error.code === "42P01") setUnsupported(true);
        return;
      }
      accept(data as LiveLocation | null);
    };
    void load();
    const channel = client
      .channel(`trip-location-${tripId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "trip_locations", filter: `trip_id=eq.${tripId}` }, (payload) => {
        if (payload.eventType === "DELETE") accept(null);
        else accept(payload.new as LiveLocation);
      })
      .subscribe();
    const poll = setInterval(() => { if (!document.hidden) void load(); }, 10000);
    const clock = setInterval(() => setNow(Date.now()), 5000);
    const resume = () => { if (!document.hidden) void load(); };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    return () => {
      alive = false;
      void client.removeChannel(channel);
      clearInterval(poll); clearInterval(clock);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
    };
  }, [client, tripId]);
  const freshness = location ? locationFreshness(location.recorded_at, now) : null;
  const driver = location ? { lat: location.latitude, lng: location.longitude } : null;
  return { location, loaded, unsupported, now, freshness, driver };
}

/** Texto de estado de la ubicación del conductor para el pasajero. */
export function liveHeadline(live: ReturnType<typeof useTripLiveLocation>, status: string, target: MapPoint | null) {
  const eta = live.driver && target && live.freshness !== "lost" ? etaMinutes(live.driver, target) : null;
  return !live.loaded
    ? "Buscando la ubicación de tu conductor…"
    : !live.location
      ? "Esperando la ubicación de tu conductor"
      : live.freshness === "lost"
        ? "Sin señal reciente de tu conductor"
        : status === "arrived"
          ? "Tu conductor está en el punto de recogida"
          : status === "ongoing"
            ? `Llegan a tu destino en aprox. ${eta} min`
            : `Tu conductor llega en aprox. ${eta} min`;
}

/** Línea compacta "En vivo · llega en X min · actualizada hace Y". */
export function LiveDriverStatus({ live, status, target }: { live: ReturnType<typeof useTripLiveLocation>; status: string; target: MapPoint | null }) {
  if (live.unsupported) return null;
  return (
    <div className="live-map-header live-inline" role="status">
      <span className={"live-badge " + (live.freshness ?? "waiting")}><i aria-hidden="true" />{live.freshness === "live" ? "En vivo" : live.freshness === "stale" ? "Con retraso" : "Sin señal"}</span>
      <strong>{liveHeadline(live, status, target)}</strong>
      {live.location ? <small>Ubicación actualizada {ageLabel(live.location.recorded_at, live.now)}</small> : live.loaded && <small>Aparecerá cuando tu conductor tenga la app abierta.</small>}
    </div>
  );
}

/** Mapa del pasajero con la posición del conductor en vivo. */
export function PassengerLiveMap({ tripId, status, origin, destination }: { tripId: string; status: string; origin: string; destination: string }) {
  const live = useTripLiveLocation(tripId);
  const { location } = live;
  const [routeFrom, setRouteFrom] = useState<MapPoint | null>(null);
  const lastRoute = useRef<{ point: MapPoint; at: number } | null>(null);
  const pickup = useMemo(() => parseStoredPlace(origin), [origin]);
  const dropoff = useMemo(() => parseStoredPlace(destination), [destination]);
  const target = status === "ongoing" ? dropoff : pickup;

  const driver = location ? { lat: location.latitude, lng: location.longitude } : null;
  useEffect(() => {
    if (!driver) return;
    const time = Date.now();
    if (refreshNavigationRoute(lastRoute.current, driver, time) || !lastRoute.current) {
      lastRoute.current = { point: driver, at: time };
      setRouteFrom(driver);
    }
    // Solo cuando cambia la posición recibida.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location?.recorded_at]);
  useEffect(() => { lastRoute.current = null; setRouteFrom(driver); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (live.unsupported) return null;
  return (
    <section className="live-map" aria-label="Ubicación del conductor en tiempo real">
      <LiveDriverStatus live={live} status={status} target={target.point} />
      <div className="live-map-frame">
        <JourneyMap
          navigation
          origin={routeFrom}
          destination={target.point}
          extraPoint={status !== "ongoing" ? dropoff.point : null}
          livePosition={driver && location ? { ...driver, accuracy: Math.min(location.accuracy, 150) } : null}
        />
      </div>
    </section>
  );
}
