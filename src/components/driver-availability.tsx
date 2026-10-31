"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {browserClient} from '@/lib/supabase/client';
import {Toast,useNotice} from './toast';

type Presence={available:boolean;reason:'signal'|'idle'|null;confirmation_due:boolean;deadline:string};
export function DriverAvailability({available,occupied,onRefresh}:{available:boolean;occupied:boolean;onRefresh:()=>Promise<void>}){
 const [state,setState]=useState<Presence|null>(null),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
 const activity=useRef(false),dialog=useRef<HTMLDialogElement>(null);
 const client=browserClient();
 const send=useCallback(async(action:string)=>{
  const {data,error}=await client.rpc('driver_presence',{action,payload:{activity:activity.current}});
  if(error){setFailed(true);return;}
  activity.current=false;setFailed(false);setState(data);
  if(data.available!==available)await onRefresh();
 },[client,available,onRefresh]);
 useEffect(()=>{
  let active=true,running=false;
  const touch=()=>{activity.current=true;};
  const beat=async()=>{if(!active||running||document.hidden)return;running=true;try{await send('heartbeat');}finally{running=false;}};
  void beat();
  const timer=setInterval(()=>void beat(),60000);
  document.addEventListener('pointerdown',touch,true);document.addEventListener('keydown',touch,true);
  document.addEventListener('visibilitychange',beat);window.addEventListener('online',beat);
  return()=>{active=false;clearInterval(timer);document.removeEventListener('pointerdown',touch,true);document.removeEventListener('keydown',touch,true);document.removeEventListener('visibilitychange',beat);window.removeEventListener('online',beat);};
 },[send,occupied]);
 const due=available&&!occupied&&state?.available&&state.confirmation_due;
 useEffect(()=>{if(due){if(!dialog.current?.open)dialog.current?.showModal();dialog.current?.focus();}else dialog.current?.close();},[due]);
 return <>
  {!available&&state?.reason&&<p className="availability-notice" role="status">{state.reason==='signal'?'Te desconectamos por falta de señal de la app.':'Te desconectamos por inactividad.'} Puedes volver a conectarte cuando estés disponible.</p>}
  {available&&failed&&<p className="availability-notice" role="status">No pudimos confirmar tu conexión. Revisa internet para mantenerte disponible.</p>}
  <dialog ref={dialog} tabIndex={-1} className="action-sheet" aria-labelledby="availability-title" onCancel={e=>e.preventDefault()}>
   <div className="sheet-handle"/><h2 id="availability-title">¿Sigues disponible?</h2>
   <p>Confirma que sigues esperando viajes. Si no respondes, te desconectaremos automáticamente.</p>
   <button className="primary" disabled={busy} onClick={async()=>{setBusy(true);try{await send('confirm');}finally{setBusy(false);}}}>{busy?'Confirmando…':'Sí, seguir conectado'}</button>
   {failed&&<p role="alert">No pudimos guardar tu confirmación. Revisa tu conexión e inténtalo otra vez.</p>}
  </dialog>
 </>;
}

type Config={signal_minutes:number;idle_minutes:number;grace_minutes:number};
export function AvailabilitySettings(){
 const [config,setConfig]=useState<Config|null>(null),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
 const {message,notify}=useNotice('availability-settings');
 const client=browserClient();
 const load=useCallback(async()=>{const {data,error}=await client.rpc('driver_presence',{action:'settings'});if(error)setFailed(true);else{setConfig(data);setFailed(false);}},[client]);
 useEffect(()=>{void load();},[load]);
 return <form className="trip-card" onSubmit={async e=>{
  e.preventDefault();if(busy)return;setBusy(true);
  const f=new FormData(e.currentTarget),payload={signal_minutes:Number(f.get('signal')),idle_minutes:Number(f.get('idle')),grace_minutes:Number(f.get('grace'))};
  try{const {data,error}=await client.rpc('driver_presence',{action:'save',payload});if(error)throw error;setConfig(data);notify('Disponibilidad actualizada.');}catch{notify('No pudimos guardar la configuración.');}finally{setBusy(false);}
 }}>
  <h2>Disponibilidad de conductores</h2>
  <p className="muted">La app envía una señal cada minuto mientras está visible. La desconexión se revisa cada minuto y nunca interrumpe un viaje activo.</p>
  {!config?<>{failed?<button type="button" className="secondary" onClick={()=>void load()}>Reintentar configuración</button>:<p role="status">Cargando configuración…</p>}</>:<>
   <label>Desconectar sin señal (minutos)<input name="signal" type="number" min="2" max="60" step="1" required defaultValue={config.signal_minutes}/></label>
   <label>Pedir confirmación sin interacción (minutos)<input name="idle" type="number" min="5" max="240" step="1" required defaultValue={config.idle_minutes}/></label>
   <label>Tiempo para responder (minutos)<input name="grace" type="number" min="1" max="15" step="1" required defaultValue={config.grace_minutes}/></label>
   <p className="muted">Al bloquear el teléfono o cambiar de aplicación, el navegador puede pausar las señales. Los cambios se aplican a los conductores conectados.</p>
   <button className="primary" disabled={busy}>{busy?'Guardando…':'Guardar disponibilidad'}</button>
  </>}
  <Toast message={message}/>
 </form>;
}
