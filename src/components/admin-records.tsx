"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { browserClient } from '@/lib/supabase/client';
type Person={id:string;name:string;email:string;phone:string;role:string;approved:boolean;available:boolean};
export type AdminTrip={id:string;origin:string;destination:string;zone:string|null;fare_cents:number|null;distance_meters:number|null;status:string;passenger_id:string;driver_id:string|null;passenger_name?:string;driver_name?:string};
export function AdminRecords({section,busy,refresh,onDriver,renderTrip}:{section:'team'|'trips';busy:boolean;refresh:unknown;onDriver:(id:string,approved:boolean)=>Promise<boolean>;renderTrip:(trip:AdminTrip)=>ReactNode}){
  const client=useMemo(()=>browserClient(),[]),request=useRef(0),list=useRef<HTMLDivElement>(null);
  const [query,setQuery]=useState(''),[filter,setFilter]=useState(''),[page,setPage]=useState(0),[items,setItems]=useState<(Person|AdminTrip)[]>([]),[total,setTotal]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState(''),[height,setHeight]=useState(0);
  const load=useCallback(async()=>{const version=++request.current;setLoading(true);const {data,error}=await client.rpc('admin_records',{section,search_query:filter,page_number:page});if(version!==request.current)return;if(error)setError('No pudimos cargar los resultados. Inténtalo de nuevo.');else{setItems(data.items);setTotal(data.total);setError('');}setLoading(false);},[client,section,filter,page]);
  useEffect(()=>{void load();return()=>{request.current++;};},[load,refresh]);
  function turn(next:number){setHeight(Math.max(height,list.current?.getBoundingClientRect().height||0));setPage(next);}
  return <div className="admin-records">
    <form className="admin-records-search" onSubmit={e=>{e.preventDefault();setPage(0);setHeight(0);setFilter(query.trim());}}><label>{section==='team'?'Buscar personal':'Buscar viajes'}<input type="search" value={query} maxLength={120} onChange={e=>setQuery(e.target.value)} placeholder={section==='team'?'Nombre, correo o teléfono':'Pasajero, motorizado, destino o código'}/></label><button className="secondary" disabled={loading}>Buscar</button></form>
    <p className="muted" role="status">{loading?'Cargando…':`${total} resultados`}</p>
    {error&&<p role="alert">{error}<button className="secondary" onClick={()=>void load()}>Reintentar</button></p>}
    <div className="cards" ref={list} style={{minHeight:height||undefined}} aria-busy={loading}>{items.map(item=>{
      if(section==='trips')return renderTrip(item as AdminTrip);
      const p=item as Person;return <article className="trip-card team-person" key={p.id}><h2>{p.name||p.email||'Usuario sin nombre'}</h2>{p.email&&<p className="team-email">{p.email}</p>}{p.phone&&<p className="muted">{p.phone}</p>}<p>{p.role==='admin'?'Administrador':p.role==='driver'?'Motorizado':'Pasajero'} · {p.approved?'Aprobado':'Sin aprobar'}</p>{p.role!=='admin'&&<button className="secondary" disabled={busy||loading} onClick={async()=>{await onDriver(p.id,!p.approved);await load();}}>{p.approved?'Suspender':'Aprobar como motorizado'}</button>}</article>;
    })}{!loading&&!items.length&&!error&&<p className="muted">No hay resultados para esta búsqueda.</p>}</div>
    <div className="catalog-pages"><button type="button" className="secondary" disabled={!page||loading||busy} onClick={()=>turn(page-1)}>Anterior</button><span>Página {page+1} de {Math.max(1,Math.ceil(total/12))}</span><button type="button" className="secondary" disabled={(page+1)*12>=total||loading||busy} onClick={()=>turn(page+1)}>Siguiente</button></div>
  </div>;
}
