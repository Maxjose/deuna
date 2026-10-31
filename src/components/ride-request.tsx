"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AppIcon } from "./app-icon";
import { PromoBanners } from "./promo-banners";
import type { Favorite } from './favorite-places';
import { Toast, useNotice } from "./toast";
import { usd, type FareQuote } from "@/lib/fare";
import { type Place, placeSearchUrl, localPlaces, mergeSearchPlaces, searchCenter } from "@/lib/journey";
import { decodeCatalogPlaces } from "@/lib/catalog";
import { browserClient } from "@/lib/supabase/client";
import {selectedPointLabel} from '@/lib/journey';
import type {MapPoint} from '@/lib/destination';
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
  home, work, homeLoading, homeError, onSetupHome, onManagePlaces,
}: {
  enabled: boolean;
  busy: boolean;
  offline: boolean;
  onRequest: (payload: Record<string, unknown>) => Promise<void>;
  home?: Favorite;
  homeLoading: boolean;
  homeError: string;
  onSetupHome: () => void;
  work?: Favorite;
  onManagePlaces: () => void;
}) {
  const [step, setStep] = useState<Step>("home"),
    [active, setActive] = useState<"origin" | "destination">("destination"),
    [origin, setOrigin] = useState<Place>({ label: "", point: null }),
    [destination, setDestination] = useState<Place>({ label: "", point: null }),
    [results, setResults] = useState<Place[]>([]),
    [locating, setLocating] = useState(false),
    [loading, setLoading] = useState(false),
    [moto, setMoto] = useState(false),
    [routeReady, setRouteReady] = useState(false);
  const [mapReference,setMapReference]=useState<'origin'|'destination'|null>(null);
  const [mapCompact,setMapCompact]=useState(false);
  const [quote, setQuote] = useState<FareQuote | null>(null), [quoteRevision, setQuoteRevision] = useState(0), [expired, setExpired] = useState(false);
  const quotePlaces = useMemo(() => ({ origin, destination }), [origin, destination]);
  const { message, notify: setMessage } = useNotice(step);
  useEffect(() => {
    if (step === "confirm" && !enabled) setMessage("Las solicitudes no están disponibles en este horario.");
  }, [step, enabled, setMessage]);
  useEffect(() => {
    setExpired(false);
    if (!quote) return;
    const timer = setTimeout(() => setExpired(true), Math.max(0, quote.expires_at * 1000 - Date.now()));
    return () => clearTimeout(timer);
  }, [quote]);
  const dialog = useRef<HTMLDialogElement>(null),
    quickHome = useRef(false),
    locationVersion = useRef(0),
    searchController = useRef<AbortController | null>(null),
    searchVersion = useRef(0);
  const update = active === "origin" ? setOrigin : setDestination;
  useEffect(() => {
    if (step !== "home" && !dialog.current?.open) {
      dialog.current?.showModal();
      dialog.current?.focus({ preventScroll: true });
    }
    if (step === "home") dialog.current?.close();
  }, [step]);
  useEffect(() => () => { searchController.current?.abort(); locationVersion.current++; }, []);
  const stepRef = useRef(step), backRef = useRef<() => void>(() => {});
  useEffect(() => {
    stepRef.current = step;
    const state = window.history.state as { rideStep?: boolean } | null;
    if (step !== "home" && !state?.rideStep) window.history.pushState({ ...state, rideStep: true }, "");
    if (step === "home" && state?.rideStep) window.history.back();
  }, [step]);
  useEffect(() => {
    const onPop = () => { if (stepRef.current !== "home") backRef.current(); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  function open() {
    setMapCompact(false);
    setStep("search");
    setActive("destination");
    setMessage("");
  }
  function back() {
    searchVersion.current++;searchController.current?.abort();setLoading(false);
    locationVersion.current++;
    setLocating(false);
    setMessage("");
    setStep(
      step === "confirm" ? "choose" : step === "choose" ? "search" : "home",
    );
  }
  backRef.current = back;
  function edit(kind: "origin" | "destination") {
    setMapCompact(false);
    setMapReference(null);
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
    setMapCompact(true);
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    const timeout = setTimeout(() => controller.abort(), 12000);
    setLoading(true);
    setMessage("");
    setResults([]);
    try {
      const endpoint = placeSearchUrl(
        process.env.NEXT_PUBLIC_GEOCODING_URL ||
          "https://photon.komoot.io/api/",
        query, origin.point,
      );
      let catalog:Place[]=[],external:Place[]=[];
      const publish=()=>{if(version===searchVersion.current)setResults(mergeSearchPlaces(catalog,external));};
      const center=searchCenter(origin.point);
      const sources=await Promise.allSettled([
        browserClient().rpc('catalog_search',{search_query:query,center_lat:center.lat,center_lng:center.lng}).abortSignal(controller.signal).then(({data,error})=>{
          if(error)throw error;catalog=decodeCatalogPlaces(data);publish();
        }),
        fetch(endpoint,{signal:controller.signal}).then(async r=>{if(!r.ok)throw Error();external=localPlaces(await r.json(),origin.point);publish();})
      ]);
      if (version !== searchVersion.current) return;
      const places=mergeSearchPlaces(catalog,external);
      if(sources.every(source=>source.status==='rejected'))throw Error();
      if(!places.length&&sources.some(source=>source.status==='rejected'))throw Error();
      if (!places.length) {
        setMapCompact(false);
        setMessage("No encontramos ese lugar en el Zulia. Puedes fijarlo en el mapa.");
      }
    } catch {
      if (version === searchVersion.current) {
        setMapCompact(false);
        setMessage(
          "No pudimos buscar la dirección. Puedes elegirla en el mapa.",
        );
      }
    } finally {
      clearTimeout(timeout);
      if (version === searchVersion.current) setLoading(false);
    }
  }
  function locate(goHome = false) {
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
        if(goHome) {
          if(home && p.coords.latitude===home.latitude && p.coords.longitude===home.longitude){setMessage('La recogida y el destino deben ser diferentes.');return;}
          setStep('choose');
        }
      },
      () => {
        if (version !== locationVersion.current) return;
        setLocating(false);
        setMessage("No pudimos obtener tu ubicación. Escribe la recogida o selecciónala en el mapa.");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  }
  useEffect(() => {
    if (step === "search" && !origin.point) { const goHome=quickHome.current;quickHome.current=false;locate(goHome); }
  }, [step]);
  async function pickPoint(point:MapPoint){
    const kind=active,setPlace=kind==='origin'?setOrigin:setDestination;
    const version=++searchVersion.current;
    searchController.current?.abort();
    const controller=new AbortController();searchController.current=controller;
    if(kind==='origin'){locationVersion.current++;setLocating(false);}
    setResults([]);setMapReference(kind);setPlace({label:'',point});setLoading(true);setQuote(null);setRouteReady(false);
    const timer=setTimeout(()=>controller.abort(),6000);
    try{
      const url=new URL('https://photon.komoot.io/reverse');url.search=new URLSearchParams({lat:String(point.lat),lon:String(point.lng),lang:'es',radius:'0.75',limit:'1'}).toString();
      const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw Error();
      const label=selectedPointLabel(await response.json(),point);
      if(version!==searchVersion.current)return;
      setPlace({label,point});
      if(!label)setMessage('Escribe una referencia para este punto del mapa.');
    }catch{if(version===searchVersion.current)setMessage('No reconocimos la dirección. Escribe una referencia sin mover el punto.');}
    finally{clearTimeout(timer);if(version===searchVersion.current)setLoading(false);}
  }
  function next() {
    if(!origin.label.trim()||!destination.label.trim()){setMessage('Escribe una referencia para la recogida y el destino.');return;}
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
        <AppIcon name="search" />
        <span>Selecciona tu destino</span>
      </button>
      <section className="home-places" aria-labelledby="places-title">
        <h2 id="places-title">Tus lugares</h2>
        <div className="home-places-grid">
          {([["home", "Casa", home], ["work", "Trabajo", work]] as const).map(([kind, title, place]) => (
            <button key={kind} className="home-place" disabled={homeLoading} onClick={() => {
              if (homeError) { setMessage(homeError); return; }
              if (!place) { if (kind === "home") onSetupHome(); else onManagePlaces(); return; }
              setOrigin({ label: "", point: null });
              setDestination({ label: place.label, point: { lat: place.latitude, lng: place.longitude } });
              setMoto(false); setQuote(null); setRouteReady(false); quickHome.current = true; open();
            }}>
              <span className="home-place-icon"><AppIcon name={kind} /></span>
              <span className="home-place-text"><strong>{title}</strong><small>{place ? place.label : "Agregar"}</small></span>
            </button>
          ))}
        </div>
      </section>
      <section className="home-services" aria-labelledby="services-title">
        <h2 id="services-title">Elige tu tipo de viaje</h2>
        <button className="home-service-main" onClick={open}>
          <span className="home-service-icon"><AppIcon name="moto" /></span>
          <span className="home-service-text"><strong>De1na Moto</strong><small>Viajes individuales</small></span>
          <span className={"home-service-badge " + (enabled ? "" : "is-closed")}>{enabled ? "Disponible" : "Fuera de horario"}</span>
        </button>
        <div className="home-services-soon" aria-label="Servicios próximamente">
          <span><AppIcon name="package" />Envíos · Pronto</span>
          <span><AppIcon name="calendar" />Programar · Pronto</span>
        </div>
      </section>
      <PromoBanners hidden={step !== "home"} />
      <dialog
        ref={dialog}
        tabIndex={-1}
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
                    <button type="button" className="locate-button" onClick={()=>locate()} disabled={locating} aria-label="Usar mi ubicación actual" title="Usar mi ubicación actual">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/></svg>
                    </button>
                  </label>
                  <label className="pickup-address">
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
                    {destination.label && <button type="button" className="locate-button" aria-label="Limpiar destino" title="Limpiar destino" onClick={() => { edit("destination"); setDestination({label:"",point:null}); }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
                    </button>}
                  </label>
                  <button className="address-search-button" disabled={loading}>
                    {loading ? "Buscando…" : "Buscar dirección"}
                  </button>
                </form>
              </div>
              <div className={"journey-search-body"+(mapCompact?' map-is-compact':'')}>
                  <div className="place-results">
                    {results.map((place, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          searchVersion.current++;
                          searchController.current?.abort();
                          setLoading(false);
                          setMapCompact(false);
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
                        onPick={point=>void pickPoint(point)}
                      />
                      {mapCompact&&<button type="button" className="expand-picker-map" onClick={()=>setMapCompact(false)}>Ver mapa</button>}
                    </div>
                    {mapReference===active&&current.point&&<label className="map-reference">Referencia del punto marcado<input aria-label="Referencia del punto marcado" maxLength={110} value={current.label} disabled={loading} placeholder="Calle, negocio o referencia para llegar" onChange={e=>update({...current,label:e.target.value})}/></label>}

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
                key={quoteRevision}
                origin={origin.point}
                destination={destination.point}
                onRoute={setRouteReady}
                quotePlaces={quotePlaces}
                onQuote={setQuote}
              />
              <section className="journey-bottom-sheet">
                <div className="sheet-handle" />
                <h2>
                  {step === "choose"
                    ? "Elige cómo ir"
                    : "Confirma tu recorrido"}
                </h2>
                {quote && <div className="fare-summary" aria-live="polite">
                  <strong>{usd(quote.fare_cents)}</strong>
                  <span>{(quote.distance_meters / 1000).toLocaleString('es-VE', { maximumFractionDigits: 2 })} km · {Math.max(1, Math.round(quote.duration_seconds / 60))} min aprox.</span>
                  <small>Pago directo al motorizado · USD</small>
                </div>}
                {expired && <button className="secondary" onClick={() => { setQuote(null); setQuoteRevision(n => n + 1); }}>Actualizar precio</button>}
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
                        !routeReady || !quote || expired || busy || offline || !enabled
                      }
                      onClick={async () => {
                        try {
                          if (!quote || expired) return;
                          await onRequest({ quote: quote.quote, signature: quote.signature });
                        } catch (error) {
                          setMessage(
                            error instanceof Error ? error.message : "No se pudo solicitar el viaje. Inténtalo otra vez.",
                          );
                        }
                      }}
                    >
                      {busy ? "Solicitando…" : "Confirmar y solicitar"}
                      <AppIcon name="arrow" />
                    </button>
                  </>
                )}
              </section>
            </>
          ))}
        <Toast message={message} />
      </dialog>
    </div>
  );
}
