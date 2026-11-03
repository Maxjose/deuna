"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { browserClient } from '@/lib/supabase/client';
import { DriverReputation } from './trip-resolution';
type Person={id:string;name:string;email:string;phone:string;role:string;approved:boolean;available:boolean;suspended:boolean};
export type AdminTrip={id:string;origin:string;destination:string;zone:string|null;fare_cents:number|null;distance_meters:number|null;status:string;passenger_id:string;driver_id:string|null;passenger_name?:string;driver_name?:string};
import {AdminCreateUser} from './admin-create-user';
import {AdminWallet} from './wallet';
import {AdminDriverEarnings} from './earnings';
import {AdminCancellations} from './driver-availability';
export function AdminRecords({viewerId,section,busy,refresh,onDriver,renderTrip}:{viewerId:string;section:'team'|'users'|'trips'|`person:${string}`;busy:boolean;refresh:unknown;onDriver:(id:string,approved:boolean)=>Promise<boolean>;renderTrip:(trip:AdminTrip)=>ReactNode}){
  const detail=useRef<HTMLDialogElement>(null);
 const [notice,setNotice]=useState(''),[memberTab,setMemberTab]=useState('info');
 const [layout,setLayoutState]=useState<'grid'|'list'>('grid');
 useEffect(()=>{try{if(localStorage.getItem('de1na-people-layout')==='list')setLayoutState('list');}catch{/* sin almacenamiento */}},[]);
 const setLayout=(v:'grid'|'list')=>{setLayoutState(v);try{localStorage.setItem('de1na-people-layout',v);}catch{/* sin almacenamiento */}};
  const [person,setPerson]=useState<Person|null>(null),[operation,setOperation]=useState(''),[saving,setSaving]=useState(false),[actionError,setActionError]=useState('');
  useEffect(()=>{if(person)detail.current?.showModal();},[person]);
  const isPeople=section==='team'||section==='users';
  const client=useMemo(()=>browserClient(),[]),request=useRef(0),list=useRef<HTMLDivElement>(null);
  const [query,setQuery]=useState(''),[filter,setFilter]=useState(''),[page,setPage]=useState(0),[items,setItems]=useState<(Person|AdminTrip)[]>([]),[total,setTotal]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState(''),[height,setHeight]=useState(0);
  const load=useCallback(async()=>{const version=++request.current;setLoading(true);const {data,error}=await client.rpc('admin_records',{section,search_query:filter,page_number:page});if(version!==request.current)return;if(error)setError('No pudimos cargar los resultados. Inténtalo de nuevo.');else{setItems(data.items);setTotal(data.total);setError('');}setLoading(false);},[client,section,filter,page]);
  useEffect(()=>{void load();return()=>{request.current++;};},[load,refresh]);
  function turn(next:number){setHeight(Math.max(height,list.current?.getBoundingClientRect().height||0));setPage(next);}
  function operationLabel(value:string){return ({suspend_account:'suspender cuenta',restore_account:'reactivar cuenta',assign_driver:'asignar como conductor',approve_driver:'aprobar conductor',suspend_driver:'suspender conductor'} as Record<string,string>)[value]||value;}
  async function manage(){
    if(!person||!operation||saving)return;setSaving(true);setActionError('');
    try{const {error}=await client.rpc('admin_manage',{person_id:person.id,operation});if(error)throw error;await load();detail.current?.close();}
    catch(error){const message=(error as {message?:string}).message;setActionError(message==='Esta cuenta tiene un viaje activo'?'Primero debe finalizar o cancelar el viaje activo.':'No pudimos realizar el cambio. Revisa el estado de la cuenta e inténtalo de nuevo.');}
    finally{setSaving(false);}
  }
  return <div className="admin-records">
    {(section==='users'||section==='team')&&<AdminCreateUser defaultRole={section==='team'?'driver':'passenger'} onCreated={text=>{setNotice(text);setPage(0);setFilter('');setQuery('');void load();}}/>}
    {notice&&<p className="admin-create-notice" role="status">{notice}</p>}
    <form className="admin-records-search" onSubmit={e=>{e.preventDefault();setPage(0);setHeight(0);setFilter(query.trim());}}><label>{isPeople?(section==='team'?'Buscar equipo':'Buscar usuarios'):'Buscar viajes'}<input type="search" value={query} maxLength={120} onChange={e=>setQuery(e.target.value)} placeholder={isPeople?'Nombre, correo o teléfono':'Pasajero, conductor, destino o código'}/></label><button className="secondary" disabled={loading}>Buscar</button>
    {isPeople&&<div className="layout-toggle" role="group" aria-label="Vista del listado">
      <button type="button" aria-pressed={layout==='grid'} aria-label="Vista en cuadrícula" onClick={()=>setLayout('grid')}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg></button>
      <button type="button" aria-pressed={layout==='list'} aria-label="Vista en lista" onClick={()=>setLayout('list')}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg></button>
    </div>}</form>
    <p className="muted" role="status">{loading?'Cargando…':`${total} resultados`}</p>
    {error&&<p role="alert">{error}<button className="secondary" onClick={()=>void load()}>Reintentar</button></p>}
    <div className={"cards"+(isPeople&&layout==='list'?" people-list":"")} ref={list} style={{minHeight:height||undefined}} aria-busy={loading}>{items.map(item=>{
      if(!isPeople)return renderTrip(item as AdminTrip);
      const p=item as Person;return <article className="trip-card team-person" key={p.id}><h2>{p.name||p.email||'Usuario sin nombre'}</h2>{p.email&&<p className="team-email">{p.email}</p>}{p.phone&&<p className="muted">{p.phone}</p>}<p>{p.role==='admin'?'Administrador':p.role==='driver'?'Conductor':'Pasajero'} · {p.role==='driver'?(p.approved?'Aprobado':'Sin habilitaci\u00f3n'):'Usuario'}</p><p className="muted">{p.suspended?'Cuenta suspendida':p.role==='driver'?(p.available?'Disponible':'Desconectado'):'Cuenta activa'}</p><button className="secondary" disabled={busy||loading} onClick={()=>{setOperation('');setActionError('');setMemberTab('info');setPerson(p);}}>Gestionar</button></article>;
    })}{!loading&&!items.length&&!error&&<p className="muted">No hay resultados para esta búsqueda.</p>}</div>
    <div className="catalog-pages"><button type="button" className="secondary" disabled={!page||loading||busy} onClick={()=>turn(page-1)}>Anterior</button><span>Página {page+1} de {Math.max(1,Math.ceil(total/12))}</span><button type="button" className="secondary" disabled={(page+1)*12>=total||loading||busy} onClick={()=>turn(page+1)}>Siguiente</button></div>
    {isPeople&&<dialog ref={detail} className="action-sheet member-sheet" aria-label="Gestionar cuenta" onCancel={e=>{if(saving)e.preventDefault();}} onClose={()=>{setPerson(null);setOperation('');}}>
      {person&&<><div className="member-top">
      <div className="service-tabs member-tabs" role="tablist" aria-label="Secciones de la cuenta">
        {(person.role==='driver'?[['info','Información'],['payout','Cuenta de cobro'],['trips','Historial de viajes'],['movements','Movimientos']]:[['info','Información'],['wallet','Saldo'],['trips','Historial de viajes']]).map(([value,label])=>
          <button key={value} type="button" role="tab" aria-selected={memberTab===value} className={memberTab===value?'is-active':''} onClick={()=>setMemberTab(value)}>{label}</button>)}
      </div>
      <button className="icon-button" disabled={saving} aria-label="Cerrar ficha" onClick={()=>detail.current?.close()}>×</button></div>
      <div className="member-panel" role="tabpanel" key={memberTab}>
      {memberTab==='info'&&<div className="member-info">
      <h2 className="member-name">{person.name||person.email||'Usuario sin nombre'}</h2>
      <p className="team-email">{person.email}</p>{person.phone&&<p>{person.phone}</p>}
      <DriverReputation viewerId={viewerId} personId={person.id}/>
      <p>{person.role==='driver'?'Conductor · Moto':'Pasajero'} · {person.suspended?'Cuenta suspendida':person.role==='driver'?(person.approved?'Aprobado':'Sin habilitación para conducir'):'Cuenta activa'}</p>
      {person.role==='driver'&&<p className="muted">{person.available?'Disponible para viajes':'Desconectado'}</p>}
      {operation?<div className="member-confirm"><p>¿Confirmar: {operationLabel(operation)}?</p><p className="muted">La cuenta no debe tener viajes activos.</p><button className="primary" disabled={saving||busy} onClick={()=>void manage()}>{saving?'Guardando…':'Confirmar cambio'}</button><button className="secondary" disabled={saving} onClick={()=>setOperation('')}>Cancelar</button></div>:<div className="member-actions">
        {person.role==='driver'?<button className="secondary" disabled={busy} onClick={()=>setOperation(person.approved?'suspend_driver':'approve_driver')}>{person.approved?'Suspender conductor':'Aprobar conductor'}</button>:<><button className="secondary" disabled={busy} onClick={()=>setOperation(person.suspended?'restore_account':'suspend_account')}>{person.suspended?'Reactivar cuenta':'Suspender cuenta'}</button><button className="secondary" disabled={busy||person.suspended} onClick={()=>setOperation('assign_driver')}>Asignar como conductor</button></>}
      </div>}
      {actionError&&<p role="alert">{actionError}</p>}
      <AdminCancellations key={person.id} personId={person.id} driver={person.role==='driver'}/>
      </div>}
      {memberTab==='wallet'&&person.role==='passenger'&&<div className="member-info"><AdminWallet key={person.id} personId={person.id}/></div>}
      {memberTab==='payout'&&person.role==='driver'&&<AdminDriverEarnings key={person.id+'p'} driverId={person.id} view="payout"/>}
      {memberTab==='movements'&&person.role==='driver'&&<AdminDriverEarnings key={person.id+'m'} driverId={person.id} view="movements"/>}
      {memberTab==='trips'&&<section className="member-history"><AdminRecords viewerId={viewerId} key={person.id} section={`person:${person.id}`} busy={saving||busy} refresh={refresh} onDriver={onDriver} renderTrip={renderTrip}/></section>}
      </div>
      </>}
    </dialog>}
  </div>;
}
