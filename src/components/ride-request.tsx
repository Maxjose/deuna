"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AppIcon } from "./app-icon";
import { destinationLabel } from "@/lib/destination";
import { decodePlaces, type Place } from "@/lib/journey";
const JourneyMap = dynamic(() => import("./journey-map"), {
  ssr: false,
  loading: () => <div className="journey-map-placeholder">Abriendo mapa…</div>,
});
type Step = "home" | "search" | "choose" | "confirm";
export function RideRequest({
  enabled,
  busy,
  offline,
  onRequest,
}: {
  enabled: boolean;
  busy: boolean;
  offline: boolean;
  onRequest: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [step, setStep] = useState<Step>("home"),
    [active, setActive] = useState<"origin" | "destination">("destination"),
    [origin, setOrigin] = useState<Place>({ label: "", point: null }),
    [destination, setDestination] = useState<Place>({ label: "", point: null }),
    [results, setResults] = useState<Place[]>([]),
    [locating, setLocating] = useState(false),
    [loading, setLoading] = useState(false),
    [message, setMessage] = useState(""),
    [moto, setMoto] = useState(false),
    [routeReady, setRouteReady] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    locationVersion = useRef(0),
    searchController = useRef<AbortController | null>(null),
    searchVersion = useRef(0);
  const update = active === "origin" ? setOrigin : setDestination;
  useEffect(() => {
    if (step !== "home" && !dialog.current?.open) {
      dialog.current?.showModal();
    }
    if (step === "home") dialog.current?.close();
  }, [step]);
  useEffect(() => () => { searchController.current?.abort(); locationVersion.current++; }, []);
  function open() {
    setStep("search");
    setActive("destination");
    setMessage("");
    if (!origin.point) locate();
  }
  function back() {
    locationVersion.current++;
    setLocating(false);
    setMessage("");
    setStep(
      step === "confirm" ? "choose" : step === "choose" ? "search" : "home",
    );
  }
  function edit(kind: "origin" | "destination") {
    if (kind === "origin") { locationVersion.current++; setLocating(false); }
    searchVersion.current++;
    searchController.current?.abort();
    setLoading(false);
    setActive(kind);
    setResults([]);
    setMessage("");
  }
  async function search(e: React.FormEvent) {
    e.preventDefault();
    const query = (active === "origin" ? origin : destination).label.trim();
    if (query.length < 3) {
      setMessage(
        "Escribe al menos tres caracteres o elige el punto en el mapa.",
      );
      return;
    }
    const version = ++searchVersion.current;
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    const timeout = setTimeout(() => controller.abort(), 12000);
    setLoading(true);
    setMessage("");
    setResults([]);
    try {
      const endpoint = new URL(
        process.env.NEXT_PUBLIC_GEOCODING_URL ||
          "https://photon.komoot.io/api/",
      );
      endpoint.searchParams.set("q", query);
      endpoint.searchParams.set("lat", String(origin.point?.lat || 11.087));
      endpoint.searchParams.set("lon", String(origin.point?.lng || -71.603));
      endpoint.searchParams.set("limit", "6");
      const r = await fetch(endpoint, { signal: controller.signal });
      if (!r.ok) throw Error();
      const places = decodePlaces(await r.json());
      if (version !== searchVersion.current) return;
      setResults(places);
      if (!places.length)
        setMessage("No encontramos ese lugar. Puedes fijarlo en el mapa.");
    } catch {
      if (version === searchVersion.current)
        setMessage(
          "No pudimos buscar la dirección. Puedes elegirla en el mapa.",
        );
    } finally {
      clearTimeout(timeout);
      if (version === searchVersion.current) setLoading(false);
    }
  }
  function locate() {
    const version = ++locationVersion.current;
    if (!navigator.geolocation) {
      setMessage("Puedes elegir tu recogida en el mapa.");
      setActive("origin");
      return;
    }
    setLocating(true);
    setMessage("");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (version !== locationVersion.current) return;
        setOrigin({ label: "Mi ubicación actual", point: { lat: p.coords.latitude, lng: p.coords.longitude } });
        setLocating(false);
      },
      () => {
        if (version !== locationVersion.current) return;
        setLocating(false);
        setMessage("No pudimos obtener tu ubicación. Escribe la recogida o selecciónala en el mapa.");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  }
  function next() {
    if (!destination.point) {
      setActive("destination");
      setMessage("Selecciona un resultado o fija el destino en el mapa.");
      return;
    }
    if (!origin.point) {
      setActive("origin");
      setMessage("Confirma dónde te buscamos. Usa tu ubicación o el mapa.");
      return;
    }
    if (
      origin.point.lat === destination.point.lat &&
      origin.point.lng === destination.point.lng
    ) {
      setMessage("La recogida y el destino deben ser diferentes.");
      return;
    }
    setMessage("");
    setStep("choose");
  }
  const current = active === "origin" ? origin : destination;
  return (
    <div className="ride-entry">
      <button className="ride-search-entry" onClick={open}>
        <AppIcon name="ride" />
        <span>¿A dónde quieres ir?</span>
        <AppIcon name="arrow" />
      </button>
      <section className="home-services" aria-labelledby="services-title">
        <h2 id="services-title">Nuestros Servicios</h2>
        <div className="home-services-grid">
          <button className="home-service" onClick={open}>
            <span className="home-service-icon"><AppIcon name="moto" /></span>
            <strong>Moto</strong>
          </button>
          <button className="home-service" disabled>
            <span className="home-service-icon"><AppIcon name="package" /></span>
            <strong>Envíos</strong>
            <small>Próximamente</small>
          </button>
          <button className="home-service" disabled>
            <span className="home-service-icon"><AppIcon name="calendar" /></span>
            <strong>Programar</strong>
            <small>Próximamente</small>
          </button>
        </div>
      </section>
      <dialog
        ref={dialog}
        className="journey-flow-screen"
        aria-label="Solicitar un viaje"
        onCancel={(e) => {
          e.preventDefault();
          back();
        }}
      >
        {step !== "home" &&
          (step === "search" ? (
            <>
              <header className="journey-search-nav">
                <button
                  type="button"
                  className="icon-button"
                  onClick={back}
                  aria-label="Volver"
                >
                  ←
                </button>
                <strong>Tu recorrido</strong>
              </header>
              <div className="journey-search-header">
                <form onSubmit={search} className="journey-addresses">
                  <label className="pickup-address">
                    <span className="address-dot" />
                    Recogida
                    <input
                      aria-label="Punto de recogida"
                      value={origin.label}
                      onFocus={() => edit("origin")}
                      onChange={(e) => {
                        edit("origin");
                        setOrigin({ label: e.target.value, point: null });
                        setResults([]);
                      }}
                      maxLength={110}
                      placeholder={locating ? "Buscando tu ubicación…" : "¿Dónde te buscamos?"}
                    />
                    <button type="button" className="locate-button" onClick={locate} disabled={locating} aria-label="Usar mi ubicación actual" title="Usar mi ubicación actual">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/></svg>
                    </button>
                  </label>
                  <label>
                    <span className="address-dot destination" />
                    Destino
                    <input
                      aria-label="Destino"
                      value={destination.label}
                      onFocus={() => edit("destination")}
                      onChange={(e) => {
                        edit("destination");
                        setDestination({ label: e.target.value, point: null });
                        setResults([]);
                      }}
                      maxLength={110}
                      placeholder="¿A dónde quieres ir?"
                    />
                  </label>
                  <button className="address-search-button" disabled={loading}>
                    {loading ? "Buscando…" : "Buscar dirección"}
                  </button>
                </form>
              </div>
              <div className="journey-search-body">
                {message && (
                  <p className="notice" role="status">
                    {message}
                  </p>
                )}
                  <div className="place-results">
                    {results.map((place, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          update(place);
                          setResults([]);
                          setMessage("");
                        }}
                      >
                        <span className="place-symbol">
                          <AppIcon name="ride" />
                        </span>
                        <span>
                          <strong>{place.label}</strong>
                          <small>Seleccionar ubicación</small>
                        </span>
                      </button>
                    ))}
                  </div>
                    <div className="point-picker-label">
                      Toca el mapa para fijar{" "}
                      {active === "origin" ? "la recogida" : "el destino"}
                    </div>
                    <div className="journey-picker-map">
                      <JourneyMap
                        origin={origin.point}
                        destination={destination.point}
                        picking
                        onPick={(point) => {
                          if (active === "origin") { locationVersion.current++; setLocating(false); }
                          setResults([]);
                          update({
                            label:
                              current.label ||
                              (active === "origin"
                                ? "Punto de recogida"
                                : "Destino seleccionado"),
                            point,
                          });
                        }}
                      />
                    </div>

              </div>
              <div className="journey-bottom-action">
                <button className="primary" onClick={next} disabled={loading}>
                  Continuar
                  <AppIcon name="arrow" />
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="journey-map-top">
                <button
                  className="icon-button"
                  aria-label="Volver"
                  onClick={back}
                >
                  ←
                </button>
                <span>{destination.label}</span>
              </div>
              <JourneyMap
                origin={origin.point}
                destination={destination.point}
                onRoute={setRouteReady}
              />
              <section className="journey-bottom-sheet">
                <div className="sheet-handle" />
                <h2>
                  {step === "choose"
                    ? "Elige cómo ir"
                    : "Confirma tu recorrido"}
                </h2>
                {step === "choose" ? (
                  <>
                    <button
                      className={"moto-option " + (moto ? "is-selected" : "")}
                      aria-pressed={moto}
                      onClick={() => setMoto(true)}
                    >
                      <span className="service-icon">
                        <AppIcon name="moto" />
                      </span>
                      <span>
                        <strong>De1na Moto</strong>
                        <small>Un viaje para ti · 1 pasajero</small>
                      </span>
                      <span className="selection-dot" />
                    </button>
                    <button
                      className="primary"
                      disabled={!moto}
                      onClick={() => setStep("confirm")}
                    >
                      Elegir Moto
                      <AppIcon name="arrow" />
                    </button>
                  </>
                ) : (
                  <>
                    <div className="confirmation-stops">
                      <div>
                        <span>A</span>
                        <p>
                          <small>TE BUSCAMOS EN</small>
                          <strong>{origin.label}</strong>
                        </p>
                      </div>
                      <div>
                        <span>B</span>
                        <p>
                          <small>TU DESTINO</small>
                          <strong>{destination.label}</strong>
                        </p>
                      </div>
                    </div>
                    <button
                      className="primary"
                      disabled={
                        !routeReady || busy || offline || !enabled
                      }
                      onClick={async () => {
                        try {
                          await onRequest({
                            origin: destinationLabel(
                              origin.label,
                              origin.point,
                            ),
                            destination: destinationLabel(
                              destination.label,
                              destination.point,
                            ),
                          });
                        } catch {
                          setMessage(
                            "No se pudo solicitar el viaje. Inténtalo otra vez.",
                          );
                        }
                      }}
                    >
                      {busy ? "Solicitando…" : "Confirmar y solicitar"}
                      <AppIcon name="arrow" />
                    </button>
                    {!enabled && (
                      <p className="service-closed">
                        Las solicitudes no están disponibles en este momento.
                      </p>
                    )}
                    {message && <p role="status">{message}</p>}
                  </>
                )}
              </section>
            </>
          ))}
      </dialog>
    </div>
  );
}
