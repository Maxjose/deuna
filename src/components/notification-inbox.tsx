"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { browserClient } from "@/lib/supabase/client";
import { AppIcon } from "./app-icon";
type Notice = {id:string; title:string; body:string; created_at:string; read_at:string|null};
export function NotificationInbox({userId}:{userId:string}) {
  const dialog=useRef<HTMLDialogElement>(null),closeTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [expanded,setExpanded]=useState(false),[closing,setClosing]=useState(false);
  useEffect(()=>()=>{if(closeTimer.current)clearTimeout(closeTimer.current);},[]);
  function close(){if(closing||!dialog.current?.open)return;setClosing(true);closeTimer.current=setTimeout(()=>{dialog.current?.close();setClosing(false);},window.matchMedia("(prefers-reduced-motion: reduce)").matches?0:220);}
  const gesture=useRef<{x:number;y:number;id?:string}|null>(null);
  const [items,setItems]=useState<Notice[]>([]),[opened,setOpened]=useState(false),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const client=useMemo(()=>browserClient(),[]);
  const load=useCallback(async()=>{
    const {data,error}=await client.from('notification_inbox').select('id,title,body,created_at,read_at').eq('user_id',userId).eq('dismissed',false).order('created_at',{ascending:false}).limit(50);
    if(error){setError('No pudimos cargar las notificaciones.');return;}
    setItems(data||[]);setError('');
  },[client,userId]);
  useEffect(()=>{void load();const timer=setInterval(()=>{if(!document.hidden)void load();},30000);window.addEventListener('focus',load);return()=>{clearInterval(timer);window.removeEventListener('focus',load);};},[load]);
  async function open(){if(closeTimer.current)clearTimeout(closeTimer.current);setClosing(false);setExpanded(false);setConfirm(false);setOpened(true);dialog.current?.showModal();dialog.current?.focus({preventScroll:true});await load();}
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
  function end(x:number,y:number){const start=gesture.current;gesture.current=null;if(!start)return;const dx=x-start.x,dy=y-start.y;if(start.id&&dx < -65&&Math.abs(dx)>Math.abs(dy))void dismiss(start.id);else if(!start.id&&Math.abs(dy)>70&&Math.abs(dy)>Math.abs(dx)){if(dy<0)setExpanded(true);else close();}}
  return <>
    <button type="button" className="inbox-bell icon-button" aria-label="Abrir notificaciones" onClick={()=>void open()}><AppIcon name="notifications"/>{items.some(item=>!item.read_at)&&<i className="inbox-unread"/>}</button>
    <dialog ref={dialog} tabIndex={-1} className={"action-sheet inbox-sheet"+(expanded?" is-expanded":"")+(closing?" is-closing":"")} onCancel={e=>{e.preventDefault();close();}} onClick={e=>{if(e.target!==e.currentTarget)return;const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}} aria-labelledby="inbox-title" onClose={()=>{setOpened(false);setConfirm(false);}}>
      <header className="inbox-heading" onPointerDown={e=>{if((e.target as HTMLElement).closest('button')){gesture.current=null;return;}gesture.current={x:e.clientX,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerUp={e=>end(e.clientX,e.clientY)} onPointerCancel={()=>{gesture.current=null;}}>
        <div className="sheet-handle"/><div className="row"><h2 id="inbox-title">Notificaciones</h2><div className="inbox-header-actions">
          {confirm?<><button type="button" className="icon-button inbox-confirm" aria-label="Confirmar limpieza de notificaciones" disabled={busy} onClick={()=>void dismiss()}><AppIcon name="check"/></button><button type="button" className="icon-button" aria-label="Cancelar limpieza" disabled={busy} onClick={()=>setConfirm(false)}><AppIcon name="close"/></button></>:<button type="button" className="icon-button" aria-label="Limpiar notificaciones" disabled={busy||!items.length} onClick={()=>setConfirm(true)}><AppIcon name="brush"/></button>}
        </div></div>
        {confirm&&<p className="inbox-confirm-label">¿Limpiar todas las notificaciones?</p>}
      </header>
      {error&&<p role="alert">{error}<button className="text" onClick={()=>void load()}>Reintentar</button></p>}
      <div className="inbox-list" onTouchStart={e=>{if(e.target===e.currentTarget)gesture.current={x:e.touches[0].clientX,y:e.touches[0].clientY};}} onTouchEnd={e=>{if(e.target===e.currentTarget)end(e.changedTouches[0].clientX,e.changedTouches[0].clientY);}}>{!items.length&&!error?<div className="inbox-empty"><AppIcon name="notifications"/><h3>Todo al día</h3><p>Aquí aparecerán tus notificaciones.</p></div>:items.map(item=><article className="inbox-notice" key={item.id} onTouchStart={e=>{gesture.current={x:e.touches[0].clientX,y:e.touches[0].clientY,id:item.id};}} onTouchEnd={e=>end(e.changedTouches[0].clientX,e.changedTouches[0].clientY)} onTouchCancel={()=>{gesture.current=null;}}>
        <div><strong>{item.title}</strong><p>{item.body}</p><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString('es-VE',{dateStyle:'short',timeStyle:'short'})}</time></div><button type="button" className="icon-button" disabled={busy} aria-label={`Eliminar notificación: ${item.title}`} onClick={()=>void dismiss(item.id)}>×</button>
      </article>)}</div>
    </dialog>
  </>;
}
