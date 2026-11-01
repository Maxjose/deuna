"use client";
import {useEffect,useMemo,useRef,useState,useSyncExternalStore,useCallback} from 'react';
import {browserClient} from '@/lib/supabase/client';
import {parseStoredPlace} from '@/lib/journey';
import {participantKey,readParticipant,subscribeParticipant} from '@/lib/participant-cache';
import {loadReputation,loadTripContact,type Reputation,type TripContact} from '@/lib/participant-data';
export function TripCancellation({pending,passenger,busy,onAction}:{pending:boolean;passenger:boolean;busy:boolean;onAction:(action:string,approved?:boolean)=>Promise<boolean>}){
 const sheet=useRef<HTMLDialogElement>(null);
 const open=()=>{sheet.current?.showModal();sheet.current?.focus({preventScroll:true});},close=()=>sheet.current?.close();
 const run=async(action:string,approved?:boolean)=>{if(await onAction(action,approved))close();};
 if(!pending&&passenger)return null;
 return <div className="trip-cancellation">
  {pending?<><p>{passenger?'Tu conductor solicita cancelar este viaje.':'Cancelación solicitada. El viaje continúa activo hasta que el cliente autorice.'}</p>{passenger&&<button className="secondary" disabled={busy} onClick={open}>Responder solicitud</button>}</>
   :<button className="text" disabled={busy} onClick={open}>Cancelar viaje</button>}
  <dialog ref={sheet} tabIndex={-1} className="action-sheet" aria-labelledby="trip-cancel-title" onCancel={e=>{if(busy)e.preventDefault();}}>
   <div className="sheet-handle"/>
   {passenger?<>
    <h2 id="trip-cancel-title">¿Autorizar la cancelación?</h2>
    <p className="muted">Tu conductor pidió cancelar este viaje. Si lo autorizas, el viaje termina aquí.</p>
    <button className="primary" disabled={busy} onClick={()=>void run('respond_cancel',false)}>Continuar con el viaje</button>
    <button className="secondary danger" disabled={busy} onClick={()=>void run('respond_cancel',true)}>{busy?'Cancelando…':'Sí, cancelar viaje'}</button>
   </>:<>
    <h2 id="trip-cancel-title">¿Cancelar este viaje?</h2>
    <p className="muted">Se pedirá autorización al pasajero. El viaje seguirá activo mientras responde.</p>
    <button className="primary" disabled={busy} onClick={close}>Seguir con el viaje</button>
    <button className="secondary danger" disabled={busy} onClick={()=>void run('request_cancel')}>{busy?'Enviando…':'Sí, solicitar cancelación'}</button>
   </>}
  </dialog>
 </div>;
}
/** Botón redondo de teléfono: WhatsApp (mensaje o llamada) o llamada normal a la otra persona del viaje. */
export function TripContactButton({tripId,viewerId}:{tripId:string;viewerId:string}){
 const key=participantKey(viewerId,'trip',tripId);
 const person=useSyncExternalStore(useCallback(listener=>subscribeParticipant(key,listener),[key]),useCallback(()=>readParticipant<TripContact>(key),[key]),()=>null);
 useEffect(()=>{void loadTripContact(browserClient(),viewerId,tripId).catch(()=>{});},[viewerId,tripId]);
 const sheet=useRef<HTMLDialogElement>(null);
 const phone=person?.phone||'';
 const wa=whatsappNumber(phone);
 return <>
  <button type="button" className="secondary trip-call-button" aria-label="Llamar o escribir por teléfono" onClick={()=>{sheet.current?.showModal();sheet.current?.focus({preventScroll:true});}}>
   <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z"/></svg>
  </button>
  <dialog ref={sheet} tabIndex={-1} className="action-sheet" aria-labelledby={'contact-title-'+tripId}>
   <div className="sheet-handle"/>
   <h2 id={'contact-title-'+tripId}>Contactar a {person?.name||'la otra persona'}</h2>
   {phone?<>
    <p className="muted">{phone}</p>
    <a className="primary" href={`https://wa.me/${wa}?text=${encodeURIComponent('Hola, te escribo por el viaje de De1na.')}`} target="_blank" rel="noopener" onClick={()=>sheet.current?.close()}>Escribir por WhatsApp</a>
    <a className="secondary" href={`https://wa.me/${wa}`} target="_blank" rel="noopener" onClick={()=>sheet.current?.close()}>Llamar por WhatsApp</a>
    <a className="secondary" href={`tel:${phone}`} onClick={()=>sheet.current?.close()}>Llamada normal</a>
   </>:<p className="muted">{person?'Esta persona no registró un teléfono de contacto. Usa el chat del viaje.':'Cargando contacto…'}</p>}
   <button className="text" onClick={()=>sheet.current?.close()}>Cerrar</button>
  </dialog>
 </>;
}
/** Número internacional para WhatsApp; los números venezolanos 04xx… pasan a 584xx…. */
function whatsappNumber(phone:string){
 const digits=phone.replace(/\D/g,'');
 if(digits.startsWith('0')&&digits.length===11)return '58'+digits.slice(1);
 return digits;
}
export function DriverReputation({personId,viewerId}:{personId:string;viewerId:string}){
 const key=participantKey(viewerId,'rating',personId);
 const rating=useSyncExternalStore(useCallback(listener=>subscribeParticipant(key,listener),[key]),useCallback(()=>readParticipant<Reputation>(key),[key]),()=>null);
 useEffect(()=>{void loadReputation(browserClient(),viewerId,personId).catch(()=>{});},[viewerId,personId]);
 return <p className="reputation">★ {rating?(rating.count?`${Number(rating.average).toFixed(1)} / 5 · ${rating.count} valoraciones`:'Sin valoraciones todavía'):'—'}</p>;
}
type Completed={id:string;driver_name:string;destination:string};
export function TripPerson({tripId,label,viewerId}:{tripId:string;label:string;viewerId:string}){
 const key=participantKey(viewerId,'trip',tripId);
 const person=useSyncExternalStore(useCallback(listener=>subscribeParticipant(key,listener),[key]),useCallback(()=>readParticipant<TripContact>(key),[key]),()=>null);
 useEffect(()=>{void loadTripContact(browserClient(),viewerId,tripId).catch(()=>{});},[viewerId,tripId]);
 return <div className="trip-person"><small>{label}</small><strong>{person?.name||'—'}</strong><p className="reputation">★ {person?(person.rating.count?`${Number(person.rating.average).toFixed(1)} / 5 · ${person.rating.count} valoraciones`:'Sin valoraciones todavía'):'—'}</p></div>;
}
export function TripCompletion({refresh,onDone}:{refresh:unknown;onDone:()=>void}){
 const client=useMemo(()=>browserClient(),[]),dialog=useRef<HTMLDialogElement>(null);
 const [trip,setTrip]=useState<Completed|null>(null),[stars,setStars]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let alive=true;void client.rpc('trip_feedback',{action:'pending'}).then(({data,error})=>{if(alive&&!error)setTrip(data);});return()=>{alive=false;};},[client,refresh]);
 useEffect(()=>{if(trip){setStars(0);setError('');dialog.current?.showModal();dialog.current?.focus();}},[trip?.id]);
 async function save(rate:boolean){if(!trip||busy)return;setBusy(true);setError('');const {error}=await client.rpc('trip_feedback',{action:rate?'rate':'dismiss',trip_id:trip.id,stars:rate?stars:null});if(error)setError('No pudimos guardar. Inténtalo de nuevo.');else{dialog.current?.close();setTrip(null);onDone();}setBusy(false);}
 return <dialog ref={dialog} tabIndex={-1} className="completion-screen" aria-labelledby="completion-title" onCancel={e=>{e.preventDefault();if(!busy)void save(false);}}><div className="completion-check" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none"><path d="m15 32 12 12 24-26" stroke="currentColor" strokeWidth="6" strokeLinecap="square" strokeLinejoin="miter"/></svg></div><h2 id="completion-title">¡Viaje finalizado!</h2>{trip&&<><p>{parseStoredPlace(trip.destination).label}</p><p>¿Cómo fue tu viaje con {trip.driver_name}?</p></>}<div className="rating-stars" aria-label="Calificar a tu contacto del viaje">{[1,2,3,4,5].map(value=><button key={value} type="button" aria-label={`${value} ${value===1?'estrella':'estrellas'}`} aria-pressed={stars===value} disabled={busy} className={value<=stars?'chosen':''} onClick={()=>setStars(value)}>★</button>)}</div>{error&&<p role="alert">{error}</p>}<button className="primary" disabled={!stars||busy} onClick={()=>void save(true)}>{busy?'Guardando…':'Enviar calificación'}</button><button className="text" disabled={busy} onClick={()=>void save(false)}>Volver al inicio</button></dialog>;
}
