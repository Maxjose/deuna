"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { browserClient } from "@/lib/supabase/client";
import { AppIcon } from "./app-icon";
type Notice = {id:string; title:string; body:string; created_at:string; read_at:string|null};
export function NotificationInbox({userId}:{userId:string}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const gesture=useRef<{x:number;y:number;id?:string}|null>(null);
  const [items,setItems]=useState<Notice[]>([]),[opened,setOpened]=useState(false),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const client=useMemo(()=>browserClient(),[]);
  const load=useCallback(async()=>{
    const {data,error}=await client.from('notification_inbox').select('id,title,body,created_at,read_at').eq('user_id',userId).eq('dismissed',false).order('created_at',{ascending:false}).limit(50);
    if(error){setError('No pudimos cargar las notificaciones.');return;}
    setItems(data||[]);setError('');
  },[client,userId]);
  useEffect(()=>{void load();const timer=setInterval(()=>{if(!document.hidden)void load();},30000);window.addEventListener('focus',load);return()=>{clearInterval(timer);window.removeEventListener('focus',load);};},[load]);
  async function open(){setConfirm(false);setOpened(true);dialog.current?.showModal();await load();}
  useEffect(()=>{
    const ids=items.filter(item=>!item.read_at).map(item=>item.id);
    if(!opened||!ids.length)return;
    let active=true;
    const now=new Date().toISOString();
    void client.from('notification_inbox').update({read_at:now}).eq('user_id',userId).in('id',ids).then(({error})=>{if(!error&&active)setItems(current=>current.map(item=>ids.includes(item.id)?{...item,read_at:now}:item));});
    return()=>{active=false;};
  },[opened,items,client,userId]);
  async function dismiss(id?:string){
    if(busy)return;setBusy(true);setError('');
    let request=client.from('notification_inbox').update({dismissed:true}).eq('user_id',userId).eq('dismissed',false);
    request=id?request.eq('id',id):request.lte('created_at',new Date().toISOString());
    const {error}=await request;
    if(error)setError('No pudimos eliminar las notificaciones. Inténtalo de nuevo.');
    else {setConfirm(false);await load();}
    setBusy(false);
  }
  function end(x:number,y:number){const start=gesture.current;gesture.current=null;if(!start)return;const dx=x-start.x,dy=y-start.y;if(start.id&&dx < -65&&Math.abs(dx)>Math.abs(dy))void dismiss(start.id);else if(!start.id&&dy>70&&dy>Math.abs(dx))dialog.current?.close();}
  return <>
    <button type="button" className="inbox-bell icon-button" aria-label="Abrir notificaciones" onClick={()=>void open()}><AppIcon name="notifications"/>{items.some(item=>!item.read_at)&&<i className="inbox-unread"/>}</button>
    <dialog ref={dialog} className="action-sheet inbox-sheet" aria-labelledby="inbox-title" onClose={()=>{setOpened(false);setConfirm(false);}}>
      <header className="inbox-heading" onTouchStart={e=>{gesture.current={x:e.touches[0].clientX,y:e.touches[0].clientY};}} onTouchEnd={e=>end(e.changedTouches[0].clientX,e.changedTouches[0].clientY)} onTouchCancel={()=>{gesture.current=null;}}>
        <div className="sheet-handle"/><div className="row"><h2 id="inbox-title">Notificaciones</h2><button type="button" className="icon-button" aria-label="Cerrar notificaciones" onClick={()=>dialog.current?.close()}>×</button></div>
      </header>
      {items.length>0&&<div className="inbox-clear">{confirm?<><span>¿Limpiar todas las notificaciones?</span><button className="secondary danger" disabled={busy} onClick={()=>void dismiss()}>Sí, limpiar</button><button className="secondary" disabled={busy} onClick={()=>setConfirm(false)}>Cancelar</button></>:<button className="secondary" disabled={busy} onClick={()=>setConfirm(true)}>Limpiar</button>}</div>}
      {error&&<p role="alert">{error}<button className="text" onClick={()=>void load()}>Reintentar</button></p>}
      <div className="inbox-list">{!items.length&&!error?<div className="inbox-empty"><AppIcon name="notifications"/><h3>Todo al día</h3><p>Aquí aparecerán tus notificaciones.</p></div>:items.map(item=><article className="inbox-notice" key={item.id} onTouchStart={e=>{gesture.current={x:e.touches[0].clientX,y:e.touches[0].clientY,id:item.id};}} onTouchEnd={e=>end(e.changedTouches[0].clientX,e.changedTouches[0].clientY)} onTouchCancel={()=>{gesture.current=null;}}>
        <div><strong>{item.title}</strong><p>{item.body}</p><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString('es-VE',{dateStyle:'short',timeStyle:'short'})}</time></div><button type="button" className="icon-button" disabled={busy} aria-label={`Eliminar notificación: ${item.title}`} onClick={()=>void dismiss(item.id)}>×</button>
      </article>)}</div>
    </dialog>
  </>;
}
