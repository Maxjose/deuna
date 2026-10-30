"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { browserClient } from '@/lib/supabase/client';
import type { MapPoint } from '@/lib/destination';
import { AppIcon } from './app-icon';
import { Toast, useNotice } from './toast';
const JourneyMap=dynamic(()=>import('./journey-map'),{ssr:false});
export type Favorite={kind:'home'|'work';label:string;latitude:number;longitude:number};
export function useFavoritePlaces(userId:string){
  const client=useMemo(()=>browserClient(),[]);
  const [favorites,setFavorites]=useState<Favorite[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const load=useCallback(async()=>{setLoading(true);const {data,error}=await client.from('favorite_places').select('kind,label,latitude,longitude').eq('user_id',userId);if(error)setError('No pudimos cargar tus lugares favoritos.');else{setFavorites(data||[]);setError('');}setLoading(false);},[client,userId]);
  useEffect(()=>{void load();},[load]);
  return {favorites,loading,error,reload:load};
}
export function FavoritePlaces({userId,favorites,onSave,setupHome=false,onSetupHandled}:{userId:string;favorites:Favorite[];onSave:()=>Promise<void>;setupHome?:boolean;onSetupHandled:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null),version=useRef(0);
  const [kind,setKind]=useState<'home'|'work'>('home'),[label,setLabel]=useState(''),[point,setPoint]=useState<MapPoint|null>(null),[busy,setBusy]=useState(false);
  const {message,notify}=useNotice('favorite-places');
  useEffect(()=>()=>{version.current++;},[]);
  function edit(next:'home'|'work'){
    const favorite=favorites.find(p=>p.kind===next);setKind(next);setLabel(favorite?.label|| (next==='home'?'Casa':'Trabajo'));setPoint(favorite?{lat:favorite.latitude,lng:favorite.longitude}:null);
    version.current++;dialog.current?.showModal();
  }
  useEffect(()=>{if(setupHome){edit('home');onSetupHandled();}},[setupHome]);
  function locate(){const current=++version.current;if(!navigator.geolocation){notify('Selecciona el punto en el mapa.');return;}navigator.geolocation.getCurrentPosition(p=>{if(version.current===current)setPoint({lat:p.coords.latitude,lng:p.coords.longitude});},()=>{if(version.current===current)notify('No pudimos ubicarte. Marca el punto en el mapa.');},{enableHighAccuracy:true,timeout:12000,maximumAge:30000});}
  async function save(e:React.FormEvent){
    e.preventDefault();if(!point||!label.trim()||busy)return;setBusy(true);
    try{const {error}=await browserClient().from('favorite_places').upsert({user_id:userId,kind,label:label.trim(),latitude:point.lat,longitude:point.lng},{onConflict:'user_id,kind'});if(error)throw error;await onSave();dialog.current?.close();notify('Lugar favorito guardado.');}
    catch{notify('No pudimos guardar este lugar. Inténtalo de nuevo.');}finally{setBusy(false);}
  }
  return <section className="trip-card favorite-places"><h2>Mis lugares favoritos</h2>{(['home','work'] as const).map(k=>{const saved=favorites.find(p=>p.kind===k);return <button key={k} type="button" className="favorite-row secondary" onClick={()=>edit(k)}><AppIcon name={k==='home'?'home':'work'}/><span><strong>{k==='home'?'Casa':'Trabajo'}</strong><small>{saved?.label||'Establecer en el mapa'}</small></span><AppIcon name="arrow"/></button>;})}
    <Toast message={message}/>
    <dialog ref={dialog} className="action-sheet favorite-editor" aria-labelledby="favorite-title" onClose={()=>{version.current++;}} onCancel={e=>{if(busy)e.preventDefault();}}>
      <form onSubmit={save}><h2 id="favorite-title">{kind==='home'?'Mi casa':'Mi trabajo'}</h2><label>Nombre o referencia<input required maxLength={110} value={label} onChange={e=>setLabel(e.target.value)}/></label>
      <button type="button" className="secondary" onClick={locate} disabled={busy}>Usar mi ubicación actual</button><p className="muted">Toca el mapa para fijar la ubicación exacta.</p>
      <div className="favorite-map"><JourneyMap origin={null} destination={point} picking onPick={p=>{version.current++;setPoint(p);}}/></div>
      <button className="primary" disabled={busy||!point||!label.trim()}>{busy?'Guardando…':'Guardar lugar'}</button><button type="button" className="secondary" disabled={busy} onClick={()=>dialog.current?.close()}>Cancelar</button></form><Toast message={message}/>
    </dialog>
  </section>;
}
