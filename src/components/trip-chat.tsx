"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {browserClient} from '@/lib/supabase/client';
import {parseStoredPlace} from '@/lib/journey';
import {AppIcon} from './app-icon';
type Message={id:string;sender_id:string;body:string;created_at:string};
type ChatTrip={id:string;status:string;origin:string;destination:string;peer_name:string|null;peer_role:string};
export function TripChat({userId,refresh,offline}:{userId:string;refresh:unknown;offline:boolean}){
 const client=useMemo(()=>browserClient(),[]),version=useRef(0),list=useRef<HTMLDivElement>(null),nearBottom=useRef(true),pending=useRef<{id:string;body:string;trip:string}|null>(null);
 const [trip,setTrip]=useState<ChatTrip|null>(null),[messages,setMessages]=useState<Message[]>([]),[draft,setDraft]=useState(''),[loading,setLoading]=useState(true),[sending,setSending]=useState(false),[error,setError]=useState('');
 const load=useCallback(async()=>{
  const request=++version.current;
  const {data,error}=await client.rpc('trip_chat',{action:'fetch'});
  if(request!==version.current)return;
  if(error){setError('No pudimos actualizar el chat. Comprueba tu conexión.');setLoading(false);return;}
  setTrip(data.trip);setMessages(data.messages);setError('');setLoading(false);
 },[client]);
 useEffect(()=>{setDraft('');pending.current=null;nearBottom.current=true;},[trip?.id]);
 useEffect(()=>{void load();const timer=setInterval(()=>{if(!document.hidden)void load();},3000);const resume=()=>{if(!document.hidden)void load();};window.addEventListener('focus',resume);window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume);return()=>{version.current++;clearInterval(timer);window.removeEventListener('focus',resume);window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',resume);};},[load,refresh]);
 const lastMessage=messages.at(-1)?.id;
 useEffect(()=>{if(nearBottom.current&&list.current)list.current.scrollTop=list.current.scrollHeight;},[lastMessage]);
 async function send(e:React.FormEvent){
  e.preventDefault();if(!trip?.peer_name||!draft.trim()||sending||offline)return;
  const body=draft.trim(),tripId=trip.id;
  if(!pending.current||pending.current.body!==body||pending.current.trip!==tripId)pending.current={id:crypto.randomUUID(),body,trip:tripId};
  setSending(true);setError('');
  try{const {error}=await client.rpc('trip_chat',{action:'send',trip_id:tripId,message:body,client_message_id:pending.current.id});if(error)throw error;pending.current=null;setDraft('');nearBottom.current=true;await load();}
  catch{await load();setError('No pudimos enviar el mensaje. Reintenta; si el viaje terminó, el chat se cerrará.');}
  finally{setSending(false);}
 }
 if(loading)return <div className="chat-empty" role="status">Abriendo mensajes…</div>;
 return <section className="trip-chat">
  {error&&<div className="chat-error" role="alert">{error}<button className="text" onClick={()=>void load()}>Reintentar</button></div>}
  {!trip?<div className="chat-empty"><AppIcon name="messages"/><h2>Tu próximo viaje, en contacto</h2><p>Aquí podrás comunicarte con tu transportista cuando tengas un viaje activo.</p></div>:<>
   <header className="chat-header"><div className="chat-person"><span className="chat-avatar" aria-hidden="true">{trip.peer_name?.[0]?.toUpperCase()||<AppIcon name="moto"/>}</span><div><strong>{trip.peer_name||'Buscando motorizado'}</strong><small>{trip.peer_name?trip.peer_role:'El chat se habilita cuando acepte tu viaje'}</small></div></div><p><small>TU VIAJE ACTIVO</small><strong>{parseStoredPlace(trip.destination).label}</strong></p></header>
   <div ref={list} className="chat-messages" role="log" aria-label="Mensajes del viaje" aria-live="polite" aria-relevant="additions" onScroll={e=>{const el=e.currentTarget;nearBottom.current=el.scrollHeight-el.scrollTop-el.clientHeight<80;}}>
    {!messages.length&&<p className="chat-hint">{trip.peer_name?'Coordinen aquí los detalles del encuentro. El chat se elimina al finalizar o cancelar el viaje.':'Estamos esperando que un motorizado acepte el viaje.'}</p>}
    {messages.length===200&&<p className="chat-hint">Últimos 200 mensajes del viaje.</p>}
    {messages.map(message=><article key={message.id} className={'chat-bubble '+(message.sender_id===userId?'mine':'')}><p>{message.body}</p><time dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString('es-VE',{hour:'2-digit',minute:'2-digit'})}</time></article>)}
   </div>
   <form className="chat-compose" onSubmit={send}><input aria-label="Mensaje" value={draft} onChange={e=>setDraft(e.target.value)} maxLength={1000} disabled={!trip.peer_name||sending} placeholder={trip.peer_name?'Escribe un mensaje…':'Esperando motorizado…'}/><button className="primary" aria-label="Enviar mensaje" disabled={!draft.trim()||!trip.peer_name||sending||offline}><AppIcon name="arrow"/></button></form>
  </>}
 </section>;
}
