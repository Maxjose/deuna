"use client";
import {useEffect,useState} from 'react';
import {browserClient} from '@/lib/supabase/client';
import {decodeCatalogPlaces} from '@/lib/catalog';
import {localPlaces,placeSearchUrl,placeDistanceMeters,nearbyReferencePlaces,type Place} from '@/lib/journey';
import type {MapPoint} from '@/lib/destination';
import {AppIcon} from './app-icon';

export function ReferenceInput({label,point,disabled,onChange,onSelect}:{label:string;point:MapPoint;disabled:boolean;onChange:(label:string)=>void;onSelect:(place:Place)=>void}){
 const [typed,setTyped]=useState(false),[results,setResults]=useState<Place[]>([]),[loading,setLoading]=useState(false),[failed,setFailed]=useState(false);
 useEffect(()=>{
  if(!typed||disabled||label.trim().length<3){setResults([]);setLoading(false);return;}
  const controller=new AbortController();let active=true;
  setLoading(true);setFailed(false);setResults([]);
  const timer=setTimeout(async()=>{
   const timeout=setTimeout(()=>controller.abort(),6000);
   try{
    const sources=await Promise.allSettled([
     browserClient().rpc('catalog_search',{search_query:label.trim(),center_lat:point.lat,center_lng:point.lng}).abortSignal(controller.signal).then(({data,error})=>{if(error)throw error;return decodeCatalogPlaces(data);}),
     fetch(placeSearchUrl(process.env.NEXT_PUBLIC_GEOCODING_URL||'https://photon.komoot.io/api/',label.trim(),point,3),{signal:controller.signal}).then(async response=>{if(!response.ok)throw Error();return localPlaces(await response.json(),point);})
    ]);
    if(!active)return;
    setResults(nearbyReferencePlaces(sources[0].status==='fulfilled'?sources[0].value:[],sources[1].status==='fulfilled'?sources[1].value:[],point));
    setFailed(sources.every(source=>source.status==='rejected'));
   }finally{clearTimeout(timeout);if(active)setLoading(false);}
  },400);
  return()=>{active=false;clearTimeout(timer);controller.abort();};
 },[label,point.lat,point.lng,typed,disabled]);
 return <div className="map-reference reference-autocomplete">
  <label>Referencia del punto marcado<input aria-label="Referencia del punto marcado" maxLength={110} value={label} disabled={disabled} placeholder="Calle, negocio o referencia para llegar" onChange={e=>{setTyped(true);onChange(e.target.value);}}/></label>
  {typed&&label.trim().length>=3&&<>
   {loading?<small role="status">Buscando cerca del punto marcado…</small>:results.length>0?<ul aria-label="Lugares cerca del punto marcado">{results.map((place,index)=><li key={index}><button type="button" onClick={()=>{setTyped(false);setResults([]);onSelect(place);}}><AppIcon name="places"/><span><strong>{place.label}</strong><small>A {Math.round(placeDistanceMeters(place.point!,point))} m del punto marcado</small></span></button></li>)}</ul>:<small role="status">{failed?'No pudimos consultar sugerencias. Puedes escribir tu referencia.':'Sin coincidencias cercanas. Puedes conservar tu referencia escrita.'}</small>}
  </>}
 </div>;
}
