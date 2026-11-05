"use client";
import {useEffect,useMemo,useRef,useState} from 'react';
import dynamic from 'next/dynamic';
import {parseStoredPlace} from '@/lib/journey';
import {usd} from '@/lib/fare';
import {nativeBridge,isNativeApp} from '@/lib/native';
import {AppIcon} from './app-icon';
import {TripProgress} from './trip-progress';
import {TripPerson,TripCancellation,TripContactButton} from './trip-resolution';
import {useTripLiveLocation,LiveDriverStatus} from './live-location';
const JourneyMap=dynamic(()=>import('./journey-map'),{ssr:false});
const headlines:Record<string,string>={searching:'Estamos buscando quién te lleve',assigned:'¡Listo! Ya van por ti',arrived:'¡Tu De1na llegó!',ongoing:'¡Vamos en camino!'};
const descriptions:Record<string,string>={searching:'Conectando con un conductor disponible.',assigned:'Tu conductor se dirige al punto de recogida.',arrived:'Tu conductor te espera en la recogida.',ongoing:'Tu viaje hacia el destino está en curso.'};
export function RideWaiting({origin,destination,busy,onCancel,fareCents,tripId,status,viewerId,onMessage,cancelPending,onCancellation,payment}:{payment?:React.ReactNode;origin:string;destination:string;busy:boolean;onCancel:()=>void;fareCents?:number|null;tripId:string;status:string;viewerId:string;onMessage:()=>void;cancelPending:boolean;onCancellation:(action:string,approved?:boolean,reason?:string)=>Promise<boolean>}){
 const sheet=useRef<HTMLDialogElement>(null),[opened,setOpened]=useState(true);
 const from=useMemo(()=>parseStoredPlace(origin),[origin]),to=useMemo(()=>parseStoredPlace(destination),[destination]);
 useEffect(()=>{if(opened){sheet.current?.showModal();sheet.current?.focus({preventScroll:true});}},[opened]);
 const assigned=status!=='searching';
 const live=useTripLiveLocation(assigned?tripId:null);
 const target=status==='ongoing'?to.point:from.point;
 const [liveSupported,setLiveSupported]=useState(false);
 useEffect(()=>{setLiveSupported(!!nativeBridge()?.startLiveTrip);},[]);
 const requestedTrip=useRef('');
 const [notificationStatus,setNotificationStatus]=useState('');
 useEffect(()=>{
  if(!assigned)return;
  const bridge=nativeBridge();
  if(!bridge?.startLiveTrip){if(isNativeApp())setNotificationStatus('upgrade');return;}
  let previousStatus='';
  function check(){
   if(document.visibilityState!=='visible')return;
   const status=bridge!.liveTripStatus?.(tripId)??'';
   if(requestedTrip.current!==tripId||(previousStatus==='blocked'&&status==='inactive')){requestedTrip.current=tripId;bridge!.startLiveTrip!(tripId);}
   previousStatus=status;
   setNotificationStatus(bridge!.liveTripStatus?.(tripId)??'');
  }
  check();const timer=setInterval(check,2000);
  document.addEventListener('visibilitychange',check);
  return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',check);};
 },[assigned,tripId]);
 return <><article className="trip-card passenger-trip-summary"><TripProgress status={status} headline={headlines[status]}/><p>{to.label}</p><button className="primary" onClick={()=>setOpened(true)}>Ver mi viaje</button>{assigned&&<div className="trip-contact-row"><button className="secondary" onClick={onMessage}><AppIcon name="messages"/>Mensaje</button><TripContactButton tripId={tripId} viewerId={viewerId}/></div>}</article>
 <dialog ref={sheet} tabIndex={-1} className="journey-flow-screen passenger-journey" aria-label="Tu viaje en curso" onClose={event=>{if(event.target===event.currentTarget)setOpened(false);}}>
  <header className="journey-context-header"><button className="icon-button" aria-label="Volver a Inicio" onClick={()=>sheet.current?.close()}><AppIcon name="back"/></button><span>Tu viaje</span><span className="journey-map-label">Mapa</span></header>
  <div className="passenger-route-map">{opened&&<JourneyMap nearbyPlaces origin={from.point} destination={to.point} livePosition={live.driver&&live.location&&live.freshness!=='lost'?{...live.driver,accuracy:Math.min(live.location.accuracy,150)}:null}/>}</div>
  <section className="journey-bottom-sheet passenger-stage-sheet"><div className="sheet-handle"/><div key={status} className="passenger-stage-content">
   <TripProgress status={status} headline={headlines[status]}/><p className="passenger-stage-description" role="status">{descriptions[status]}</p>
   {assigned?<div className="passenger-driver-card"><span className="passenger-driver-avatar"><AppIcon name="moto"/></span><TripPerson tripId={tripId} viewerId={viewerId} label="Tu conductor"/></div>:<div className="connecting-progress" aria-hidden="true"><span/><span/><span/></div>}
   {assigned&&<LiveDriverStatus live={live} status={status} target={target}/>}
   {payment}
   {assigned&&notificationStatus==='upgrade'&&<p role="status">Actualiza la aplicación Android para ver el viaje en las notificaciones.</p>}
   {assigned&&notificationStatus==='blocked'&&<p role="status">Las notificaciones del viaje están bloqueadas en este teléfono. Actívalas en los ajustes de De1na.</p>}
   {assigned&&notificationStatus==='active'&&<p role="status">Notificación del viaje activa. Su aparición en la barra superior depende del teléfono y sus ajustes.</p>}
   {assigned&&notificationStatus==='starting'&&<p role="status">Activando la notificación del viaje…</p>}
   {assigned&&['session_required','trip_unavailable','offline','start_failed'].includes(notificationStatus)&&<p role="status">{notificationStatus==='session_required'?'No pudimos conectar la notificación con tu sesión. Vuelve a iniciar sesión y reintenta.':notificationStatus==='trip_unavailable'?'El seguimiento no encontró un viaje autorizado para esta cuenta.':notificationStatus==='offline'?'El seguimiento no pudo conectar con el servidor. Revisa tu conexión.':'Android no permitió iniciar el seguimiento. Mantén esta pantalla abierta y reintenta.'}</p>}
   {assigned&&liveSupported&&notificationStatus!=='active'&&<button type="button" className="secondary trip-notification-button" disabled={notificationStatus==='starting'} onClick={()=>{const bridge=nativeBridge();if(notificationStatus==='blocked'&&bridge?.openNotificationSettings)bridge.openNotificationSettings();else {setNotificationStatus('starting');bridge?.startLiveTrip?.(tripId);}}}>{notificationStatus==='starting'?'Activando…':notificationStatus==='blocked'?'Abrir ajustes de notificaciones':'Activar notificación del viaje'}</button>}
   {assigned&&<div className="trip-contact-row"><button className="primary passenger-message" onClick={()=>{sheet.current?.close();onMessage();}}><AppIcon name="messages"/>Mensaje</button><TripContactButton tripId={tripId} viewerId={viewerId}/></div>}
   <div className="passenger-stops"><p><small>RECOGIDA</small><strong>{from.label}</strong></p><p><small>DESTINO</small><strong>{to.label}</strong></p></div>
   <div className="passenger-stage-footer"><p>Tarifa acordada {fareCents!=null&&<strong>{usd(fareCents)}</strong>}</p>{['searching','assigned','arrived'].includes(status)&&<button className="text trip-cancel-link" disabled={busy} onClick={onCancel}>Cancelar viaje</button>}</div>
   {cancelPending&&<TripCancellation pending passenger busy={busy} onAction={onCancellation}/>}
  </div></section>
 </dialog></>;
}
