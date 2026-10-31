"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { browserClient } from '@/lib/supabase/client';
import { Toast, useNotice } from './toast';
type Draft={id:string;title:string;body:string;audience:string;devices:number;users:number};
type Campaign={id:string;title:string;body:string;audience:string;created_at:string;total:number;sent:number;failed:number;skipped:number;pending:number};
const audiences:Record<string,string>={all:'Todos los suscritos',passenger:'Clientes',driver:'Conductores'};
export function PushCampaigns() {
  const [title,setTitle]=useState(''),[body,setBody]=useState(''),[audience,setAudience]=useState('passenger'),
    [busy,setBusy]=useState(false),[campaigns,setCampaigns]=useState<Campaign[]>([]),[draft,setDraft]=useState<Draft|null>(null);
  const dialog=useRef<HTMLDialogElement>(null);
  const {message,notify}=useNotice('campaigns');
  const load=useCallback(async()=>{
    const {data,error}=await browserClient().rpc('push_manage',{action:'history',payload:{}});
    if(error)notify('No pudimos consultar el historial de envíos.');
    else setCampaigns(data||[]);
  },[notify]);
  useEffect(()=>{void load();const timer=setInterval(()=>void load(),30000);return()=>clearInterval(timer);},[load]);
  useEffect(()=>{if(draft)dialog.current?.showModal();},[draft]);
  async function preview(e:React.FormEvent) {
    e.preventDefault();setBusy(true);
    try {
      const {data,error}=await browserClient().rpc('push_manage',{action:'preview',payload:{audience}});
      if(error)throw error;
      if(!data.devices){notify('Todavía no hay dispositivos que hayan aceptado promociones para este público.');return;}
      setDraft({id:crypto.randomUUID(),title:title.trim(),body:body.trim(),audience,devices:data.devices,users:data.users});
    }catch{notify('No pudimos preparar la vista previa.');}finally{setBusy(false);}
  }
  async function send() {
    if(!draft||busy)return;
    setBusy(true);
    try {
      const {data,error}=await browserClient().rpc('push_manage',{action:'campaign',payload:{id:draft.id,title:draft.title,body:draft.body,audience:draft.audience}});
      if(error)throw error;
      dialog.current?.close();setDraft(null);setTitle('');setBody('');
      notify(`Promoción en cola para ${data.queued} dispositivos.`);await load();
    }catch{notify('No pudimos confirmar el envío. Espera unos segundos y reintenta con esta misma vista previa.');}
    finally{setBusy(false);}
  }
  return <div className="account-stack campaign-workspace">
    <form className="trip-card campaign-composer" onSubmit={preview}>
      <h2>Enviar promoción</h2><p className="muted">Solo reciben publicidad quienes la hayan activado en sus preferencias.</p>
      <label>Título<input required maxLength={80} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Una nueva vuelta te espera"/></label>
      <label>Mensaje<textarea required maxLength={240} rows={3} value={body} onChange={e=>setBody(e.target.value)} placeholder="Escribe tu promoción…"/></label>
      <label>Público<select value={audience} onChange={e=>setAudience(e.target.value)}>{Object.entries(audiences).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <button className="primary" disabled={busy||!title.trim()||!body.trim()}>{busy?'Preparando…':'Revisar notificación'}</button>
    </form>
    <section className="trip-card campaign-history"><h2>Historial de promociones</h2><p className="muted">«Enviadas» indica aceptación por el proveedor; no confirma lectura. El historial se conserva 30 días.</p>
      {!campaigns.length?<p className="muted">Aún no has enviado promociones.</p>:campaigns.map(c=><article className="campaign-summary" key={c.id}>
        <strong>{c.title}</strong><p>{c.body}</p><small>{new Date(c.created_at).toLocaleString('es-VE',{timeZone:'America/Caracas'})} · {audiences[c.audience]}</small>
        <p className="campaign-counts">Enviadas: {c.sent} · Pendientes: {c.pending} · Fallidas: {c.failed} · Omitidas: {c.skipped}</p>
      </article>)}
    </section>
    <Toast message={message}/>
    <dialog ref={dialog} className="action-sheet" aria-label="Confirmar envío de publicidad" onClose={()=>setDraft(null)} onCancel={e=>{if(busy)e.preventDefault();}}>
      <div className="sheet-handle"/><h2>Revisa antes de enviar</h2>
      {draft&&<><div className="push-preview"><small>DE1NA · AHORA</small><strong>{draft.title}</strong><p>{draft.body}</p></div>
      <p>{audiences[draft.audience]} · {draft.users} usuarios · {draft.devices} dispositivos suscritos.</p>
      <p className="muted">Al tocar la notificación se abrirá Inicio. Los destinatarios se comprueban nuevamente al enviar.</p>
      <button className="primary" disabled={busy} onClick={()=>void send()}>{busy?'Enviando…':'Enviar publicidad'}</button>
      <button className="secondary" disabled={busy} onClick={()=>dialog.current?.close()}>Volver a editar</button></>}
      <Toast message={message}/>
    </dialog>
  </div>;
}
