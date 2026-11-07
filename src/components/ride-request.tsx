"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AppIcon } from "./app-icon";
import { ReferenceInput } from './reference-input';
import { PromoBanners } from "./promo-banners";
import type { Favorite } from './favorite-places';
import { binanceReady, bs, bsAmount, pagoMovilReady, rateValue, type PaymentMethod, type PaymentSettings } from '@/lib/payments';
import { Toast, useNotice } from "./toast";
import { usd, type FareQuote } from "@/lib/fare";
import { type Place, placeDistanceMeters, placeSearchUrl, localPlaces, mergeSearchPlaces, searchCenter } from "@/lib/journey";
import { decodeCatalogPlaces } from "@/lib/catalog";
import { browserClient } from "@/lib/supabase/client";
import {selectedPointLabel} from '@/lib/journey';
import type {MapPoint} from '@/lib/destination';
const JourneyMap = dynamic(() => import("./journey-map"), {
  ssr: false,
  loading: () => <div className="journey-map-placeholder">Abriendo mapa…</div>,
});
type Step = "home" | "search" | "choose" | "payment" | "confirm";
export function RideRequest({
  enabled,
  busy,
  offline,
  onRequest,
  home, work, homeLoading, homeError, onSetupHome, onManagePlaces, payment, walletCents = 0,
}: {
  walletCents?: number;
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
  payment?: PaymentSettings | null;
}) {
  const [method, setMethod] = useState<PaymentMethod>("cash");
  // Modo suscripción: el pasajero paga directo al conductor (efectivo o pago móvil a sus cuentas). Sin saldo ni Binance.
  const direct = payment?.billing_mode === "subscription";
  const rate = rateValue(payment?.exchange_rate);
  const testTrips = payment?.test_trips_enabled === true;
  const pagoMovil = direct ? payment?.pago_movil_enabled !== false && rate != null : pagoMovilReady(payment), binance = !direct && binanceReady(payment);
  useEffect(() => { if ((method === "pago_movil" && !pagoMovil) || (method === "binance" && !binance) || (method === "wallet" && direct) || (method === "test" && !testTrips)) setMethod("cash"); }, [pagoMovil, binance, method, direct, testTrips]);
  const [step, setStep] = useState<Step>("home"),
    [active, setActive] = useState<"origin" | "destination">("destination"),
    [origin, setOrigin] = useState<Place>({ label: "", point: null }),
    [destination, setDestination] = useState<Place>({ label: "", point: null }),
    [results, setResults] = useState<Place[]>([]),
    [locating, setLocating] = useState(false),
    [loading, setLoading] = useState(false),
    [moto, setMoto] = useState(false),
    [routeReady, setRouteReady] = useState(false);
  const [mapReferences,setMapReferences]=useState({origin:false,destination:false});
  const [mapCompact,setMapCompact]=useState(false);
  const [mapVisible,setMapVisible]=useState(false);
  const [quote, setQuote] = useState<FareQuote | null>(null), [quoteRevision, setQuoteRevision] = useState(0), [expired, setExpired] = useState(false);
  const quotePlaces = useMemo(() => ({ origin, destination }), [origin, destination]);
  const fareReady = routeReady && quote !== null && !expired;
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
  const entryRef = useRef<HTMLButtonElement>(null), morphFrom = useRef<DOMRect | null>(null), morphBack = useRef<DOMRect | null>(null);
  const dialog = useRef<HTMLDialogElement>(null),
    quickHome = useRef(false),
    locationVersion = useRef(0),
    searchController = useRef<AbortController | null>(null),
    searchVersion = useRef(0);
  const update = active === "origin" ? setOrigin : setDestination;
  useEffect(() => {
    if (step !== "home") {
      if(!dialog.current?.open)dialog.current?.showModal();
      dialog.current?.focus({ preventScroll: true });
      if(step==='search')setActive(mapReferences.destination?'destination':mapReferences.origin?'origin':'destination');
    }
    if (step === "home") dialog.current?.close();
    // Animación: el buscador del inicio se transforma en la cabecera de «Tu recorrido» (y al revés al volver).
    const from = morphFrom.current; morphFrom.current = null;
    if (from && step === "search" && dialog.current) requestAnimationFrame(() => morphSearch(dialog.current!, from, "open"));
    const back = morphBack.current; morphBack.current = null;
    if (back && step === "home") requestAnimationFrame(() => { const entry = entryRef.current; if (entry) morphSearch(document.body, back, "close", entry); });
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
  function open(fromEntry = false) {
    if (fromEntry && entryRef.current) morphFrom.current = entryRef.current.getBoundingClientRect();
    setMapVisible(false);
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
    if (step === "search") { const header = dialog.current?.querySelector(".journey-search-header"); if (header) morphBack.current = header.getBoundingClientRect(); }
    setStep(
      step === "confirm" ? "payment" : step === "payment" ? "choose" : step === "choose" ? "search" : "home",
    );
  }
  backRef.current = back;
  function edit(kind: "origin" | "destination") {
    setMapCompact(false);
    setMapReferences(previous=>({...previous,[kind]:false}));
    if (kind === "origin") { locationVersion.current++; setLocating(false); }
    searchVersion.current++;
    searchController.current?.abort();
    setLoading(false);
    setActive(kind);
    setResults([]);
    setMessage("");
  }
  // Predicción mientras escribe: busca solo tras una pausa breve para no consultar en cada tecla.
  const missingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const missingQuery = useRef('');
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (typingTimer.current) clearTimeout(typingTimer.current); if(missingTimer.current)clearTimeout(missingTimer.current); }, []);
  function predict(value: string) {
    missingQuery.current=value.trim();
    if (missingTimer.current) clearTimeout(missingTimer.current);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    if (value.trim().length < 3) return;
    typingTimer.current = setTimeout(() => { void search(null, value); }, 350);
  }
  async function search(e: React.FormEvent | null, typed?: string) {
    e?.preventDefault();
    if (e && typingTimer.current) clearTimeout(typingTimer.current);
    const query = (typed ?? (active === "origin" ? origin : destination).label).trim();
    if(typed===undefined)missingQuery.current=query;
    if (typed !== undefined && query.length < 3) return;
    if (query.length < 3) {
      setMessage(
        "Escribe al menos tres caracteres o elige el punto en el mapa.",
      );
      return;
    }
    const version = ++searchVersion.current;
    setMapVisible(false);
    setMapCompact(true);
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    const timeout = setTimeout(() => controller.abort(), 12000);
    setLoading(true);
    setMessage("");
    setResults([]);
    try {
      let catalog:Place[]=[],external:Place[]=[];
      const publish=()=>{if(version===searchVersion.current)setResults(mergeSearchPlaces(catalog,external,center));};
      const center=searchCenter(origin.point);
      const sources=await Promise.allSettled([
        browserClient().rpc('catalog_search',{search_query:query,center_lat:center.lat,center_lng:center.lng}).abortSignal(controller.signal).then(({data,error})=>{
          if(error)throw error;catalog=decodeCatalogPlaces(data);publish();
        }),
        (async()=>{
          let succeeded=false;
          for(const radius of [5,20,80,undefined]){
            if(controller.signal.aborted||version!==searchVersion.current)break;
            try{
              const endpoint=placeSearchUrl(process.env.NEXT_PUBLIC_GEOCODING_URL||"https://photon.komoot.io/api/",query,center,radius);
              const response=await fetch(endpoint,{signal:controller.signal});if(!response.ok)throw Error();
              external=mergeSearchPlaces(external,localPlaces(await response.json(),center),center);succeeded=true;publish();
              const found=mergeSearchPlaces(catalog,external,center);
              if(!radius||found.filter(place=>place.point&&placeDistanceMeters(place.point,center)<=radius*1000).length>=6)break;
            }catch{if(controller.signal.aborted)break;}
          }
          if(!succeeded)throw Error();
        })()
      ]);
      if (version !== searchVersion.current) return;
      const places=mergeSearchPlaces(catalog,external,center);
      if(sources.every(source=>source.status==='rejected'))throw Error();
      if(!places.length&&sources.some(source=>source.status==='rejected'))throw Error();
      if (!places.length && active === 'destination' && !controller.signal.aborted) {
        if(missingTimer.current)clearTimeout(missingTimer.current);
        const record=()=>{if(version===searchVersion.current&&missingQuery.current===query)void browserClient().rpc('missing_places',{action:'record',search_query:query}).then(()=>{},()=>{});};
        if(typed===undefined)record();else missingTimer.current=setTimeout(record,2000);
      }
      if (!places.length && typed === undefined) {
        setMapCompact(false);
        setMessage("No encontramos ese lugar en el Zulia. Puedes fijarlo en el mapa.");
      }
    } catch {
      if (version === searchVersion.current && typed === undefined) {
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
      setMessage("Puedes elegir tu punto de encuentro en el mapa.");
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
          if(home && p.coords.latitude===home.latitude && p.coords.longitude===home.longitude){setMessage('El punto de encuentro y el destino deben ser diferentes.');return;}
          setStep('choose');
        }
      },
      () => {
        if (version !== locationVersion.current) return;
        setLocating(false);
        setMessage("No pudimos obtener tu ubicación. Escribe el punto de encuentro o selecciónalo en el mapa.");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  }
  useEffect(() => {
    if (step === "search" && !origin.point) { const goHome=quickHome.current;quickHome.current=false;locate(goHome); }
  }, [step]);
  function selectPlace(place:Place,kind:'origin'|'destination'=active){
    if(!place.point||!place.label.trim())return;
    searchVersion.current++;searchController.current?.abort();
    if(typingTimer.current)clearTimeout(typingTimer.current);
    if(missingTimer.current)clearTimeout(missingTimer.current);
    if(kind==='origin'){locationVersion.current++;setLocating(false);}
    (kind==='origin'?setOrigin:setDestination)(place);
    setMapReferences(previous=>({...previous,[kind]:false}));
    setResults([]);setLoading(false);setMapVisible(true);setMapCompact(false);
    setQuote(null);setRouteReady(false);setMessage('');
  }
  async function pickPoint(point:MapPoint){
    const kind=active,setPlace=kind==='origin'?setOrigin:setDestination;
    const version=++searchVersion.current;
    searchController.current?.abort();
    const controller=new AbortController();searchController.current=controller;
    if(kind==='origin'){locationVersion.current++;setLocating(false);}
    setResults([]);setMapReferences(previous=>({...previous,[kind]:true}));setPlace({label:'',point});setLoading(true);setQuote(null);setRouteReady(false);
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
    if(!origin.label.trim()||!destination.label.trim()){
      setActive(!origin.label.trim()?'origin':'destination');setMapVisible(true);setMapCompact(false);
      setMessage('Escribe una referencia para el punto de encuentro y el destino.');return;
    }
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
      setMessage("El punto de encuentro y el destino deben ser diferentes.");
      return;
    }
    setMessage("");
    setStep("choose");
  }
  const current = active === "origin" ? origin : destination;
  return (
    <div className="ride-entry">
      <button ref={entryRef} className="ride-search-entry" onClick={() => open(true)}>
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
        <div className="home-services-soon" aria-label="Servicios próximamente">
          <span><AppIcon name="package" />Envíos · Pronto</span>
          <span><AppIcon name="calendar" />Programar · Pronto</span>
        </div>
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
                  <AppIcon name="back" />
                </button>
                <strong>Tu recorrido</strong>
              </header>
              <div className="journey-search-header">
                <form onSubmit={search} className="journey-addresses">
                  <label className="pickup-address">
                    <span className="address-dot" />
                    Punto de encuentro
                    <span className="address-input">
                    <input
                      aria-label="Punto de encuentro"
                      value={origin.label}
                      onFocus={() => setActive("origin")}
                      onChange={(e) => {
                        edit("origin");
                        setOrigin({ label: e.target.value, point: null });
                        setResults([]);
                        predict(e.target.value);
                      }}
                      maxLength={110}
                      placeholder={locating ? "Buscando tu ubicación…" : "¿Dónde te buscamos?"}
                    />
                    <button type="button" className="locate-button" onClick={()=>locate()} disabled={locating} aria-label="Usar mi ubicación actual" title="Usar mi ubicación actual">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/></svg>
                    </button>
                    </span>
                  </label>
                  <label className="pickup-address">
                    <span className="address-dot destination" />
                    Destino
                    <span className="address-input">
                    <input
                      aria-label="Destino"
                      value={destination.label}
                      onFocus={() => setActive("destination")}
                      onChange={(e) => {
                        edit("destination");
                        setDestination({ label: e.target.value, point: null });
                        setResults([]);
                        predict(e.target.value);
                      }}
                      maxLength={110}
                      placeholder="¿A dónde quieres ir?"
                    />
                    {destination.label && <button type="button" className="locate-button" aria-label="Limpiar destino" title="Limpiar destino" onClick={() => { edit("destination"); setDestination({label:"",point:null}); }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
                    </button>}
                    </span>
                  </label>
                  <button className="address-search-button" disabled={loading}>
                    {loading ? "Buscando…" : "Buscar dirección"}
                  </button>
                </form>
              </div>
              <div className={"journey-search-body"+(mapCompact?' map-is-compact':'')+(!mapVisible?' map-is-hidden':'')}>
                  <div className="place-results">
                    {results.map((place, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          selectPlace(place);
                        }}
                      >
                        <span className="place-symbol">
                          <AppIcon name="ride" />
                        </span>
                        <span>
                          <strong><Highlight text={place.label} query={current.label} /></strong>
                          <small>Seleccionar ubicación</small>
                        </span>
                      </button>
                    ))}
                  </div>
                    {mapVisible&&<><div className="point-picker-label">
                      Toca el mapa para fijar{" "}
                      {active === "origin" ? "el punto de encuentro" : "el destino"}
                    </div>
                    <div className="journey-picker-map">
                      <JourneyMap
                        nearbyPlaces
                        onPlacePick={place=>selectPlace(place)}
                        placePickLabel={active==='origin'?'Usar como punto de encuentro':'Usar como destino'}
                        origin={origin.point}
                        destination={destination.point}
                        picking
                        onPick={point=>void pickPoint(point)}
                      />
                      {mapCompact&&<button type="button" className="expand-picker-map" onClick={()=>setMapCompact(false)}>Ver mapa</button>}
                    </div>
                    {(mapReferences[active]||!current.label.trim())&&current.point&&<ReferenceInput key={active} label={current.label} point={current.point} disabled={loading} onChange={label=>update({...current,label})} onSelect={place=>selectPlace(place)}/>}</>}
                    {!mapVisible&&<button type="button" className="show-picker-map" aria-label="Mostrar mapa" title="Mostrar mapa" onClick={()=>{setMapVisible(true);setMapCompact(false);}}><AppIcon name="map"/></button>}

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
              <div className="journey-map-top journey-context-header">
                <button
                  className="icon-button"
                  aria-label="Volver"
                  onClick={back}
                >
                  <AppIcon name="back" />
                </button>
                <span className="journey-context-destination">{destination.label}</span><span className="journey-map-label">Mapa</span>
              </div>
              <JourneyMap
                nearbyPlaces
                onPlacePick={place=>selectPlace(place,'destination')}
                placePickLabel="Usar como destino"
                key={quoteRevision}
                origin={origin.point}
                destination={destination.point}
                onRoute={setRouteReady}
                quotePlaces={quotePlaces}
                onQuote={setQuote}
              />
              <section className="journey-bottom-sheet passenger-stage-sheet journey-preparation-sheet">
                <div className="sheet-handle" />
                <AutoHeight>
                <div className="journey-preparation-steps" aria-label="Preparación del viaje"><span className={step==='choose'?'current':'done'}>1 · Transporte</span><span className={step==='payment'?'current':step==='confirm'?'done':''}>2 · Pago</span><span className={step==='confirm'?'current':''}>3 · Confirmar</span></div>
                <h2>
                  {step === "choose"
                    ? "Elige cómo ir"
                    : step === "payment"
                      ? "¿Cómo vas a pagar?"
                      : "Confirma tu recorrido"}
                </h2>
                <div className="fare-summary" aria-live="polite" aria-busy={!quote} aria-label={!quote ? "Calculando precio, distancia y tiempo" : undefined}>
                  <strong className={!quote ? "fare-placeholder" : undefined} aria-hidden={!quote}>{quote ? usd(quote.fare_cents) : '\u00a0'}</strong>
                  <span className={!quote ? "fare-placeholder" : undefined} aria-hidden={!quote}>{quote ? <><span className="approx" title="Distancia aproximada" aria-label="aproximadamente">≈</span>{`${(quote.distance_meters / 1000).toLocaleString('es-VE', { maximumFractionDigits: 2 })} km · ${Math.max(1, Math.round(quote.duration_seconds / 60))} min aprox.`}</> : '\u00a0'}</span>
                  {quote && !!quote.night_percent && <small className="fare-night">🌙 Tarifa nocturna +{quote.night_percent}%</small>}
                  {quote && rate != null && <small className="fare-bs">≈ {bs(bsAmount(quote.fare_cents, rate) ?? 0)} · tasa {rate.toLocaleString("es-VE")} Bs/USD</small>}
                </div>
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
                      disabled={!moto || !fareReady}
                      onClick={() => { if (moto && fareReady) setStep("payment"); }}
                    >
                      Elegir Moto
                      <AppIcon name="arrow" />
                    </button>
                  </>
                ) : step === "payment" ? (
                  <>
                    <div className="payment-options" role="radiogroup" aria-label="Método de pago">
                      <button type="button" role="radio" aria-checked={method === "cash"} className={"moto-option payment-option " + (method === "cash" ? "is-selected" : "")} onClick={() => setMethod("cash")}>
                        <span className="service-icon"><AppIcon name="cash" /></span>
                        <span><strong>Efectivo</strong><small>Le pagas al conductor al llegar</small></span>
                        <span className="selection-dot" />
                      </button>
                      {walletCents > 0 && !direct && <button type="button" role="radio" aria-checked={method === "wallet"} disabled={!quote || walletCents < quote.fare_cents} className={"moto-option payment-option " + (method === "wallet" ? "is-selected" : "")} onClick={() => setMethod("wallet")}>
                        <span className="service-icon"><AppIcon name="wallet" /></span>
                        <span><strong>Saldo De1na</strong><small>{quote && walletCents < quote.fare_cents ? `Saldo insuficiente (${usd(walletCents)})` : `Disponible: ${usd(walletCents)}`}</small></span>
                        <span className="selection-dot" />
                      </button>}
                      {payment?.pago_movil_enabled !== false && <button type="button" role="radio" aria-checked={method === "pago_movil"} disabled={!pagoMovil} className={"moto-option payment-option " + (method === "pago_movil" ? "is-selected" : "")} onClick={() => setMethod("pago_movil")}>
                        <span className="service-icon"><AppIcon name="phone" /></span>
                        <span><strong>Pago móvil</strong><small>{!pagoMovil ? "No disponible por ahora" : direct ? "Transferencia en bolívares al conductor" : "Transferencia en bolívares"}</small></span>
                        <span className="selection-dot" />
                      </button>}
                      {binance && <button type="button" role="radio" aria-checked={method === "binance"} className={"moto-option payment-option " + (method === "binance" ? "is-selected" : "")} onClick={() => setMethod("binance")}>
                        <span className="service-icon"><AppIcon name="wallet" /></span>
                        <span><strong>Binance Pay</strong><small>Pago en USDT</small></span>
                        <span className="selection-dot" />
                      </button>}
                      {testTrips && <button type="button" role="radio" aria-checked={method === "test"} className={"moto-option payment-option " + (method === "test" ? "is-selected" : "")} onClick={() => setMethod("test")}>
                        <span className="service-icon"><AppIcon name="check" /></span>
                        <span><strong>Viaje de prueba</strong><small>Solo para tests · sin cobro</small></span>
                        <span className="selection-dot" />
                      </button>}
                    </div>
                    <button className="primary" disabled={!fareReady} onClick={() => { if (fareReady) setStep("confirm"); }}>
                      Continuar
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
                    <div className="confirmation-payment">
                      <AppIcon name={method === "test" ? "check" : method === "cash" ? "cash" : method === "wallet" || method === "binance" ? "wallet" : "phone"} />
                      <p>
                        <small>PAGO</small>
                        <strong>{method === "test" ? "Viaje de prueba" : method === "cash" ? "Efectivo al conductor" : method === "wallet" ? "Saldo De1na" : method === "binance" ? "Binance Pay (USDT)" : "Pago móvil"}</strong>
                        <span>{method === "test" ? "No se cobra ni genera ingresos. Queda registrado como prueba." : method === "cash" ? "Ten el monto listo al llegar." : method === "wallet" ? "Se descuenta de tu saldo al solicitar. Si se cancela, vuelve a tu saldo." : method === "binance" ? "Te mostraremos el Pay ID y el monto cuando un conductor acepte." : direct ? "Le transfieres al conductor. Verás sus datos cuando acepte." : "Te mostraremos los datos para transferir cuando un conductor acepte."}</span>
                      </p>
                      <button type="button" className="text" onClick={() => setStep("payment")}>Cambiar</button>
                    </div>
                    <button
                      className="primary"
                      disabled={
                        !routeReady || !quote || expired || busy || offline || !enabled
                      }
                      onClick={async () => {
                        try {
                          if (!quote || expired) return;
                          await onRequest({ quote: quote.quote, signature: quote.signature, payment_method: method === "test" && testTrips ? "test" : method === "wallet" && !direct ? "wallet" : method === "binance" && binance ? "binance" : method === "pago_movil" && pagoMovil ? "pago_movil" : "cash" });
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
                </AutoHeight>
              </section>
            </>
          ))}
        <Toast message={message} />
      </dialog>
    </div>
  );
}

/** Anima la altura de la tarjeta inferior cuando su contenido cambia (pasos transporte → pago → confirmar). */
function AutoHeight({ children }: { children: React.ReactNode }) {
  const inner = useRef<HTMLDivElement>(null), [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    const el = inner.current; if (!el) return;
    const update = () => setHeight(el.offsetHeight);
    update();
    const observer = new ResizeObserver(update); observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return <div className="sheet-autoheight" style={height == null ? undefined : { height }}><div ref={inner}>{children}</div></div>;
}

/** Transición compartida entre el buscador del inicio y la cabecera de búsqueda (técnica FLIP con Web Animations). */
function morphSearch(host: HTMLElement, rect: DOMRect, mode: "open" | "close", entry?: HTMLElement) {
  if (typeof window === "undefined" || !("animate" in host) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const target = mode === "open" ? host.querySelector<HTMLElement>(".journey-search-header") : entry;
  if (!target) return;
  const to = target.getBoundingClientRect(), from = rect, ease = "cubic-bezier(.22,1,.36,1)", duration = 420;
  const start = from, end = to;
  const ghost = document.createElement("div");
  ghost.className = "search-morph";
  ghost.innerHTML = '<span>Selecciona tu destino</span>';
  Object.assign(ghost.style, { left: `${start.left}px`, top: `${start.top}px`, width: `${start.width}px`, height: `${start.height}px` });
  host.appendChild(ghost);
  const frames = [
    { left: `${start.left}px`, top: `${start.top}px`, width: `${start.width}px`, height: `${start.height}px`, borderRadius: mode === "open" ? "20px" : "0px" },
    { left: `${end.left}px`, top: `${end.top}px`, width: `${end.width}px`, height: `${end.height}px`, borderRadius: mode === "open" ? "0px" : "20px" },
  ];
  const move = ghost.animate(frames, { duration, easing: ease, fill: "forwards" });
  ghost.firstElementChild?.animate([{ opacity: mode === "open" ? 1 : 0 }, { opacity: mode === "open" ? 0 : 1 }], { duration: duration * 0.5, easing: "ease-out", fill: "forwards" });
  if (mode === "open") {
    const dialog = host as HTMLDialogElement;
    dialog.animate([{ backgroundColor: "rgba(0,0,0,0)" }, { backgroundColor: getComputedStyle(dialog).backgroundColor }], { duration: 300, easing: "ease-out" });
    try { dialog.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, pseudoElement: "::backdrop" }); } catch { /* sin soporte */ }
    for (const child of Array.from(dialog.children)) {
      if (child === ghost) continue;
      (child as HTMLElement).animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 320, delay: child.classList.contains("journey-search-header") ? 300 : 180, easing: ease, fill: "backwards" });
    }
  } else {
    target.animate([{ opacity: 0 }, { opacity: 0, offset: .85 }, { opacity: 1 }], { duration, fill: "backwards" });
    const home = target.parentElement;
    if (home) for (const child of Array.from(home.children)) if (child !== target && child.tagName !== "DIALOG")
      (child as HTMLElement).animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 320, delay: 140, easing: ease, fill: "backwards" });
  }
  move.finished.then(() => ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: "forwards" }).finished).catch(() => {}).finally(() => ghost.remove());
}

/** Resalta la parte del lugar que coincide con lo escrito (sin distinguir tildes ni mayúsculas). */
function Highlight({ text, query }: { text: string; query: string }) {
  const fold = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const q = fold(query.trim());
  if (q.length < 2) return <>{text}</>;
  // La versión plegada conserva la longitud de cada letra (las tildes se eliminan tras NFD), así que se mapea por índice.
  const chars = Array.from(text), folded = chars.map(c => fold(c)), joined = folded.join("");
  const at = joined.indexOf(q);
  if (at < 0) return <>{text}</>;
  let pos = 0, start = -1, end = -1;
  folded.forEach((f, i) => { if (start < 0 && pos >= at) start = i; pos += f.length; if (end < 0 && pos >= at + q.length) end = i + 1; });
  if (start < 0 || end < 0) return <>{text}</>;
  return <>{chars.slice(0, start).join("")}<span className="place-match">{chars.slice(start, end).join("")}</span>{chars.slice(end).join("")}</>;
}
