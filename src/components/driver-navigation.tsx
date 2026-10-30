"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { parseStoredPlace } from '@/lib/journey';
import { refreshNavigationRoute, usableFix, type NavigationFix } from '@/lib/navigation';
import type { MapPoint } from '@/lib/destination';
import { AppIcon } from './app-icon';
const JourneyMap=dynamic(()=>import('./journey-map'),{ssr:false});
export function DriverNavigation({origin,destination,status,busy,onAdvance,onOpenChat,children}:{origin:string;destination:string;status:string;busy:boolean;onAdvance:()=>void;onOpenChat:()=>void;children?:ReactNode}){
 const pickup=useMemo(()=>parseStoredPlace(origin),[origin]),dropoff=useMemo(()=>parseStoredPlace(destination),[destination]);
 const target=status==='ongoing'?dropoff:pickup;
 const dialog=useRef<HTMLDialogElement>(null),lastRoute=useRef<{point:MapPoint;at:number}|null>(null);
 const [opened,setOpened]=useState(true),[fix,setFix]=useState<NavigationFix|null>(null),[routeOrigin,setRouteOrigin]=useState<MapPoint|null>(null),[follow,setFollow]=useState(true),[gpsError,setGpsError]=useState(''),[retry,setRetry]=useState(0),[now,setNow]=useState(0),[awake,setAwake]=useState(true),[wakeActive,setWakeActive]=useState(false),[offline,setOffline]=useState(false);
 useEffect(()=>{if(opened){dialog.current?.showModal();dialog.current?.focus({preventScroll:true});}},[opened]);
 useEffect(()=>{
  if(!opened)return;
  let alive=true;
  lastRoute.current=null;setRouteOrigin(null);setFix(null);setGpsError('');
  if(!navigator.geolocation){setGpsError('Este dispositivo no permite obtener tu ubicación.');return;}
  const watch=navigator.geolocation.watchPosition(position=>{
   if(!alive)return;
   const next={lat:position.coords.latitude,lng:position.coords.longitude,accuracy:position.coords.accuracy,timestamp:position.timestamp};
   const time=Date.now();setNow(time);
   if(!usableFix(next,time)){setGpsError('Señal GPS imprecisa o antigua. Esperando una ubicación más precisa.');return;}
   setFix(next);setGpsError('');
   if(navigator.onLine&&refreshNavigationRoute(lastRoute.current,next,time)){
    const point={lat:next.lat,lng:next.lng};lastRoute.current={point,at:time};setRouteOrigin(point);
   }
  },error=>{if(alive)setGpsError(error.code===1?'Permite el acceso a tu ubicación para seguir la ruta.':'No recibimos una posición GPS reciente. Revisa la señal.');},{enableHighAccuracy:true,maximumAge:5000,timeout:15000});
  const timer=setInterval(()=>setNow(Date.now()),5000);
  const reconnect=()=>{setOffline(!navigator.onLine);if(navigator.onLine){lastRoute.current=null;setRetry(n=>n+1);}};
  setOffline(!navigator.onLine);window.addEventListener('online',reconnect);window.addEventListener('offline',reconnect);
  const visible=()=>{if(document.visibilityState==='visible'){lastRoute.current=null;setRetry(n=>n+1);}};
  document.addEventListener('visibilitychange',visible);
  return()=>{alive=false;navigator.geolocation.clearWatch(watch);clearInterval(timer);window.removeEventListener('online',reconnect);window.removeEventListener('offline',reconnect);document.removeEventListener('visibilitychange',visible);};
 },[opened,retry,status]);
 useEffect(()=>{
  if(!opened||!awake)return;
  let alive=true,pending=false,lock:WakeLockSentinel|null=null;
  async function acquire(){
   if(!('wakeLock' in navigator)||document.visibilityState!=='visible'||pending||lock&&!lock.released)return;
   pending=true;
   try{const next=await navigator.wakeLock.request('screen');if(!alive){await next.release();return;}lock=next;setWakeActive(true);next.addEventListener('release',()=>{if(alive)setWakeActive(false);});}
   catch{if(alive)setWakeActive(false);}finally{pending=false;}
  }
  void acquire();document.addEventListener('visibilitychange',acquire);
  return()=>{alive=false;setWakeActive(false);document.removeEventListener('visibilitychange',acquire);void lock?.release().catch(()=>{});};
 },[opened,awake]);
 const fresh=fix&&usableFix(fix,now||Date.now());
 return <><button className="secondary" onClick={()=>setOpened(true)}><AppIcon name="ride"/>Abrir navegación</button>
  <dialog ref={dialog} tabIndex={-1} className="journey-flow-screen driver-navigation" aria-label="Navegación del motorizado" onClose={()=>setOpened(false)}>
   <header className="driver-nav-header"><button className="icon-button" aria-label="Cerrar navegación" onClick={()=>dialog.current?.close()}>←</button><div><small>{status==='ongoing'?'LLEVAR AL PASAJERO':'RECOGER AL PASAJERO'}</small><strong>{target.label}</strong></div></header>
   <div className="driver-nav-map">{opened&&<JourneyMap navigation origin={routeOrigin} destination={target.point} livePosition={fix} follow={follow}/>}<button className="driver-follow secondary" aria-pressed={follow} onClick={()=>setFollow(value=>!value)}>{follow?'Explorar mapa':'Seguir mi ubicación'}</button></div>
   <footer className="driver-nav-footer">
    <button type="button" className="secondary driver-chat-button" onClick={()=>{dialog.current?.close();onOpenChat();}}><AppIcon name="messages"/>Abrir chat del viaje</button>
    <p className="driver-gps" role="status">{offline?'Sin conexión: la ruta no puede actualizarse.':gpsError||(!fix?'Buscando tu ubicación…':!fresh?'GPS sin actualizar. Esperando señal…':`GPS activo · precisión ${Math.round(fix.accuracy)} m`)}</p>
    {gpsError&&<button className="text" onClick={()=>setRetry(n=>n+1)}>Reintentar GPS</button>}
    {!target.point&&<p role="alert">Este viaje no tiene un punto guardado. Consulta la dirección con el pasajero.</p>}
    <label className="check"><input type="checkbox" checked={awake} onChange={e=>setAwake(e.target.checked)}/>Mantener pantalla encendida {awake&&<small>{wakeActive?'· Activo':'· No disponible ahora'}</small>}</label>
    <p className="muted driver-nav-note">Mantén esta pantalla abierta. Al bloquear el teléfono o cambiar de app, el GPS puede pausarse.</p>
    <button className="primary" disabled={busy} onClick={onAdvance}>{status==='assigned'?'Ya llegué a la recogida':status==='arrived'?'Iniciar viaje':'Finalizar viaje'}</button>
    {children}
   </footer>
  </dialog>
 </>;
}
