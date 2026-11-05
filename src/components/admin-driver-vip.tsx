"use client";
import {useEffect,useState} from 'react';
import {browserClient} from '@/lib/supabase/client';

export function AdminDriverVip({driverId}:{driverId:string}){
 const [enabled,setEnabled]=useState<boolean|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [retry,setRetry]=useState(0);
 useEffect(()=>{let active=true;void browserClient().rpc('driver_presence',{action:'vip_get',payload:{driver_id:driverId}}).then(({data,error})=>{if(!active)return;if(error)setError('No pudimos cargar la disponibilidad VIP.');else{setEnabled(data.enabled);setError('');}});return()=>{active=false;};},[driverId,retry]);
 return <section className="admin-cancellations"><h3>Disponibilidad VIP</h3>
 <p className="muted">Evita la desconexión automática por inactividad o falta de señal y no pide confirmar disponibilidad. El conductor debe conectarse y puede desconectarse manualmente. No cambia la prioridad de los viajes ni los requisitos de cuenta y plan.</p>
 {enabled===null?<button type="button" className="secondary" onClick={()=>setRetry(x=>x+1)} disabled={!error}>{error?'Reintentar':'Cargando…'}</button>:<label className="payment-switch"><input type="checkbox" role="switch" checked={enabled} disabled={busy} onChange={async e=>{const next=e.target.checked;setBusy(true);setError('');try{const {data,error}=await browserClient().rpc('driver_presence',{action:'vip_save',payload:{driver_id:driverId,enabled:next}});if(error)throw error;setEnabled(data.enabled);}catch{setError('No pudimos guardar el cambio. Inténtalo de nuevo.');}finally{setBusy(false);}}}/><span>{busy?'Guardando…':enabled?'Disponibilidad VIP activa':'Activar disponibilidad VIP'}</span></label>}
 {error&&<p role="alert">{error}</p>}
 </section>;
}
