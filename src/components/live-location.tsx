"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { browserClient } from "@/lib/supabase/client";
import { parseStoredPlace } from "@/lib/journey";
import type { MapPoint } from "@/lib/destination";
import { usableFix, refreshNavigationRoute } from "@/lib/navigation";
import {
  shouldShareFix, shareParams, locationFreshness, ageLabel, etaMinutes,
  type LiveLocation, type SharedFix,
} from "@/lib/live-location";

const JourneyMap = dynamic(() => import("./journey-map"), { ssr: false });

export type SharingState = "idle" | "starting" | "sharing" | "denied" | "unavailable" | "offline" | "error";

/** Comparte la posición del motorizado mientras tiene un viaje activo y la app está abierta. */
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
        const { error } = await client.rpc("share_location", shareParams(tripId, fix));
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
        if (!usableFix(fix, now)) return;
        if (shouldShareFix(previous, fix, now)) void send(fix);
      },
      (error) => { if (alive) setState(error.code === 1 ? "denied" : "error"); },
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
  return { state, lastSent };
}

const sharingCopy: Record<SharingState, string> = {
  idle: "",
  starting: "Activando tu ubicación para el pasajero…",
  sharing: "Tu pasajero ve tu ubicación en tiempo real.",
  denied: "Permite el acceso a tu ubicación para que el pasajero pueda verte llegar.",
  unavailable: "Este dispositivo no permite compartir la ubicación.",
  offline: "Sin conexión. Tu ubicación se enviará al reconectar.",
  error: "No pudimos enviar tu ubicación. Seguimos intentando.",
};

export function DriverSharingStatus({ state }: { state: SharingState }) {
  if (state === "idle") return null;
  const ok = state === "sharing";
  return (
    <p className={"sharing-status " + (ok ? "is-ok" : state === "starting" ? "" : "is-warning")} role="status">
      <i aria-hidden="true" />
      {sharingCopy[state]}
      {ok && <small>Mantén la app abierta durante el viaje.</small>}
    </p>
  );
}

/** Mapa del pasajero con la posición del motorizado en vivo (Realtime + respaldo periódico). */
export function PassengerLiveMap({ tripId, status, origin, destination }: { tripId: string; status: string; origin: string; destination: string }) {
  const client = useMemo(() => browserClient(), []);
  const [location, setLocation] = useState<LiveLocation | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [routeFrom, setRouteFrom] = useState<MapPoint | null>(null);
  const lastRoute = useRef<{ point: MapPoint; at: number } | null>(null);
  const pickup = useMemo(() => parseStoredPlace(origin), [origin]);
  const dropoff = useMemo(() => parseStoredPlace(destination), [destination]);
  const target = status === "ongoing" ? dropoff : pickup;

  useEffect(() => {
    let alive = true, version = 0;
    lastRoute.current = null;
    setLocation(null); setLoaded(false); setRouteFrom(null);
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
        // Tabla aún no creada (migración pendiente): oculta el mapa en lugar de mostrar un error.
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

  const freshness = location ? locationFreshness(location.recorded_at, now) : null;
  const eta = driver && target.point && freshness !== "lost" ? etaMinutes(driver, target.point) : null;
  const headline = !loaded
    ? "Buscando la ubicación de tu motorizado…"
    : !location
      ? "Esperando la ubicación de tu motorizado"
      : freshness === "lost"
        ? "Sin señal reciente de tu motorizado"
        : status === "arrived"
          ? "Tu motorizado está en el punto de recogida"
          : status === "ongoing"
            ? `Llegan a tu destino en aprox. ${eta} min`
            : `Tu motorizado llega en aprox. ${eta} min`;

  if (unsupported) return null;
  return (
    <section className="live-map" aria-label="Ubicación del motorizado en tiempo real">
      <div className="live-map-header">
        <span className={"live-badge " + (freshness ?? "waiting")}><i aria-hidden="true" />{freshness === "live" ? "En vivo" : freshness === "stale" ? "Con retraso" : "Sin señal"}</span>
        <strong>{headline}</strong>
        {location && <small>Ubicación actualizada {ageLabel(location.recorded_at, now)}</small>}
        {!location && loaded && <small>Aparecerá aquí cuando tu motorizado abra la app.</small>}
      </div>
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
