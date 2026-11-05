"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {browserClient} from '@/lib/supabase/client';
import {Toast,useNotice} from './toast';

type Presence={available:boolean;reason:'signal'|'idle'|null;confirmation_due:boolean;deadline:string};
export function DriverAvailability({available,occupied,onRefresh}:{available:boolean;occupied:boolean;onRefresh:()=>Promise<void>}){
 const [state,setState]=useState<Presence|null>(null),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
 const activity=useRef(false),dialog=useRef<HTMLDialogElement>(null);
 const [showDisconnection,setShowDisconnection]=useState(false);
 const disconnectionReason=!available&&!state?.available?state?.reason:null;
 useEffect(()=>{
  setShowDisconnection(!!disconnectionReason);
  if(!disconnectionReason)return;
  const timer=setTimeout(()=>setShowDisconnection(false),8000);
  return()=>clearTimeout(timer);
 },[disconnectionReason]);
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
  {showDisconnection&&disconnectionReason&&<p className="availability-notice" role="status">{disconnectionReason==='signal'?'Te desconectamos por falta de señal de la app.':'Te desconectamos por inactividad.'} Puedes volver a conectarte cuando estés disponible.</p>}
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

/** Límites de cancelación: conductor y pasajero (cancelar después de «Llegué» cuenta doble). */
export function CancelLimitSettings({ settings, onSaved }: { settings: { driver_cancel_limit?: number; driver_cancel_hours?: number; passenger_cancel_limit?: number; passenger_cancel_hours?: number }; onSaved: (text: string) => void }) {
 const [busy, setBusy] = useState(false), [err, setErr] = useState('');
 return <form className="trip-card" onSubmit={async e => {
  e.preventDefault(); const f = new FormData(e.currentTarget);
  setBusy(true); setErr('');
  const { error } = await browserClient().rpc('admin_cancel_limit', { payload: { driver_limit: Number(f.get('dl')), driver_hours: Number(f.get('dh')), passenger_limit: Number(f.get('pl')), passenger_hours: Number(f.get('ph')) } });
  setBusy(false);
  if (error) setErr('No se pudo guardar. Revisa los valores.'); else onSaved('Límites de cancelación guardados.');
 }}>
  <h2>Límites de cancelación</h2>
  <p className="muted">Evitan que se cancelen viajes para hacerlos por fuera de la app. Al llegar al límite no se puede cancelar otro viaje hasta que pase el plazo. Cancelar después de «Llegué» cuenta doble y siempre se pide el motivo.</p>
  <p className="commission-label">Conductores</p>
  <div className="two">
   <label>Cancelaciones permitidas<input name="dl" type="number" min="1" max="20" required defaultValue={settings.driver_cancel_limit ?? 2} disabled={busy} /></label>
   <label>En un plazo de (horas)<input name="dh" type="number" min="1" max="72" required defaultValue={settings.driver_cancel_hours ?? 4} disabled={busy} /></label>
  </div>
  <p className="commission-label">Pasajeros (con conductor asignado)</p>
  <div className="two">
   <label>Cancelaciones permitidas<input name="pl" type="number" min="1" max="20" required defaultValue={settings.passenger_cancel_limit ?? 3} disabled={busy} /></label>
   <label>En un plazo de (horas)<input name="ph" type="number" min="1" max="72" required defaultValue={settings.passenger_cancel_hours ?? 3} disabled={busy} /></label>
  </div>
  {err && <p className="payment-error" role="alert">{err}</p>}
  <button className="primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar límites'}</button>
 </form>;
}

/** Administración (ficha): cancelaciones de la persona en los últimos 7 días y las más recientes con su motivo. */
export function AdminCancellations({ personId, driver }: { personId: string; driver: boolean }) {
 type Item = { id: string; cancelled_at: string | null; cancelled_by: string; cancelled_stage: string | null; cancel_reason: string | null };
 const [d, setD] = useState<{ as_driver_7d: number; as_passenger_7d: number; after_arrival_7d: number; recent: Item[]; state: { blocked_until: string | null } } | null>(null);
 useEffect(() => { void browserClient().rpc('admin_cancellations', { person_id: personId }).then(({ data }) => { if (data) setD(data); }); }, [personId]);
 if (!d) return null;
 const total = driver ? d.as_driver_7d : d.as_passenger_7d;
 const stage = (s: string | null) => s === 'arrived' ? 'en el punto de recogida' : s === 'ongoing' ? 'en curso' : 'antes de llegar';
 return <div className="admin-cancellations">
  <div className="row"><h3>Cancelaciones (7 días)</h3><strong className={total >= 3 || d.after_arrival_7d >= 2 ? 'is-warn' : ''}>{total}</strong></div>
  <p className="muted">{d.after_arrival_7d} después de «Llegué»{d.state.blocked_until && new Date(d.state.blocked_until).getTime() > Date.now() ? ` · bloqueado hasta las ${new Date(d.state.blocked_until).toLocaleTimeString('es-VE', { hour: 'numeric', minute: '2-digit' })}` : ''}</p>
  {d.recent.length > 0 && <ul className="wallet-movements">{d.recent.map(i => <li key={i.id}><span><strong>{i.cancel_reason || 'Sin motivo'}</strong><small>{stage(i.cancelled_stage)}{i.cancelled_at ? ' · ' + new Date(i.cancelled_at).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' }) : ''}</small></span></li>)}</ul>}
 </div>;
}
