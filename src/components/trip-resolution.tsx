"use client";
import {useEffect,useMemo,useRef,useState,useSyncExternalStore,useCallback} from 'react';
import {browserClient} from '@/lib/supabase/client';
import {parseStoredPlace} from '@/lib/journey';
import {participantKey,readParticipant,subscribeParticipant} from '@/lib/participant-cache';
import {loadReputation,loadTripContact,type Reputation,type TripContact} from '@/lib/participant-data';
export function TripCancellation({pending,passenger,busy,onAction}:{pending:boolean;passenger:boolean;busy:boolean;onAction:(action:string,approved?:boolean)=>Promise<boolean>}){
 const [confirm,setConfirm]=useState(false);
 return <div className="trip-cancellation">{pending?<><p>{passenger?'Tu motorizado solicita cancelar este viaje.':'Cancelación solicitada. El viaje continúa activo hasta que el cliente autorice.'}</p>{passenger&&(confirm?<><p>¿Confirmas cancelar el viaje?</p><button className="secondary danger" disabled={busy} onClick={()=>void onAction('respond_cancel',true)}>Sí, autorizar cancelación</button><button className="text" onClick={()=>setConfirm(false)}>Volver</button></>:<><button className="secondary" disabled={busy} onClick={()=>setConfirm(true)}>Autorizar cancelación</button><button className="secondary" disabled={busy} onClick={()=>void onAction('respond_cancel',false)}>Continuar con el viaje</button></>)}</>:!passenger&&(confirm?<><p>Se pedirá autorización al pasajero. El viaje seguirá activo mientras responde.</p><button className="secondary danger" disabled={busy} onClick={async()=>{if(await onAction('request_cancel'))setConfirm(false);}}>Confirmar solicitud</button><button className="text" onClick={()=>setConfirm(false)}>Volver</button></>:<button className="text" disabled={busy} onClick={()=>setConfirm(true)}>Solicitar cancelar viaje</button>)}</div>;
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
