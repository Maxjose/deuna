"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { browserClient } from '@/lib/supabase/client';
import { validateCatalogDocument, type CatalogPlace, type CatalogRecord } from '@/lib/catalog';
import { Toast, useNotice } from './toast';
const JourneyMap=dynamic(()=>import('./journey-map'),{ssr:false});
type ImportPlan={places:CatalogPlace[];warnings:string[];batches:string[];completed:number;inserted:number;updated:number};
type Editor={source:string;external_id:string;name:string;latitude:string;longitude:string;aliases:string;address:string;municipality:string;category:string;reference:string;source_url:string;active:boolean;editing:boolean};
export function PlacesCatalog() {
  const [query,setQuery]=useState(''),[filter,setFilter]=useState(''),[page,setPage]=useState(0),[items,setItems]=useState<CatalogRecord[]>([]),
    [total,setTotal]=useState(0),[active,setActive]=useState(0),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),
    [errors,setErrors]=useState<string[]>([]),[plan,setPlan]=useState<ImportPlan|null>(null),[editor,setEditor]=useState<Editor|null>(null),[map,setMap]=useState(false);
  const [loadedPage,setLoadedPage]=useState(0),[listHeight,setListHeight]=useState(0);
  const list=useRef<HTMLDivElement>(null);
  function turn(next:number){setListHeight(Math.max(listHeight,list.current?.getBoundingClientRect().height||0));setPage(next);}
  const dialog=useRef<HTMLDialogElement>(null),loadVersion=useRef(0),mounted=useRef(true);
  const {message,notify}=useNotice('catalog');
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const load=useCallback(async()=>{
    const version=++loadVersion.current;setLoading(true);
    const {data,error}=await browserClient().rpc('catalog_admin',{action:'list',payload:{query:filter,page:Math.floor(page/5)}});
    if(version!==loadVersion.current)return;
    if(error)notify('No pudimos cargar el catálogo.');
    else{setLoadedPage(page);setItems(data.items);setTotal(data.total);setActive(data.active);}
    setLoading(false);
  },[filter,page,notify]);
  useEffect(()=>{void load();return()=>{loadVersion.current++;};},[load]);
  useEffect(()=>{if(editor){dialog.current?.showModal();dialog.current?.focus();}},[!!editor]);
  function edit(place?:CatalogRecord){
    setMap(false);
    setEditor(place?{...place,latitude:String(place.latitude),longitude:String(place.longitude),aliases:place.aliases.join('\n'),source_url:place.source_url||'',editing:true}:
      {source:'propio',external_id:crypto.randomUUID(),name:'',latitude:'',longitude:'',aliases:'',address:'',municipality:'',category:'',reference:'',source_url:'',active:true,editing:false});
  }
  function change(key:keyof Editor,value:string|boolean){setEditor(current=>current?{...current,[key]:value}:null);}
  const point=useMemo(()=>{
    if(!editor?.latitude.trim()||!editor.longitude.trim())return null;
    const lat=Number(editor.latitude),lng=Number(editor.longitude);
    return Number.isFinite(lat)&&Math.abs(lat)<=90&&Number.isFinite(lng)&&Math.abs(lng)<=180?{lat,lng}:null;
  },[editor?.latitude,editor?.longitude]);
  async function save(e:React.FormEvent){
    e.preventDefault();if(!editor||busy)return;
    const validation=validateCatalogDocument({version:1,places:[{source:editor.source,external_id:editor.external_id,name:editor.name,latitude:Number(editor.latitude),longitude:Number(editor.longitude),aliases:editor.aliases.split('\n').map(s=>s.trim()).filter(Boolean),address:editor.address,municipality:editor.municipality,category:editor.category,reference:editor.reference,source_url:editor.source_url,active:editor.active}]});
    if(validation.errors.length){notify(validation.errors[0]);return;}
    setBusy(true);
    try{
      const {error}=await browserClient().rpc('catalog_admin',{action:'import',payload:{version:1,batch_id:crypto.randomUUID(),places:validation.places}});
      if(error)throw error;
      dialog.current?.close();setEditor(null);notify('Lugar guardado.');await load();
    }catch{notify('No pudimos guardar el lugar. Revisa los datos y reintenta.');}finally{setBusy(false);}
  }
  async function readFile(file:File|undefined){
    setErrors([]);setPlan(null);if(!file)return;
    if(file.size>5*1024*1024){setErrors(['El archivo supera 5 MB. Divídelo en archivos de hasta 1.000 lugares.']);return;}
    setBusy(true);
    try{
      const value=JSON.parse((await file.text()).replace(/^\uFEFF/,''));
      const validation=validateCatalogDocument(value);
      if(validation.errors.length){setErrors(validation.errors);return;}
      setPlan({places:validation.places,warnings:validation.warnings,batches:Array.from({length:Math.ceil(validation.places.length/100)},()=>crypto.randomUUID()),completed:0,inserted:0,updated:0});
    }catch{setErrors(['No pudimos leer el JSON. Comprueba que sea válido y esté guardado en UTF-8.']);}
    finally{setBusy(false);}
  }
  async function importPlaces(){
    if(!plan||busy)return;setBusy(true);setErrors([]);
    let current=plan;
    try{
      for(let offset=current.completed;offset<current.places.length;offset+=100){
        if(!mounted.current)return;
        const rows=current.places.slice(offset,offset+100);
        const {data,error}=await browserClient().rpc('catalog_admin',{action:'import',payload:{version:1,batch_id:current.batches[Math.floor(offset/100)],places:rows}});
        if(error)throw Error(`Bloque ${offset+1}–${offset+rows.length}: ${error.message}`);
        current={...current,completed:offset+rows.length,inserted:current.inserted+data.inserted,updated:current.updated+data.updated};
        setPlan(current);
      }
      notify('Importación completada.');await load();
    }catch(error){setErrors([error instanceof Error?error.message:'No pudimos completar el lote.','Los bloques confirmados se conservaron. Reintentar continúa desde el bloque pendiente sin duplicar registros.']);await load();}
    finally{setBusy(false);}
  }
  return <div className="account-stack catalog-workspace">

    <div className="catalog-sidebar">
    <section className="trip-card catalog-intro"><h2>Catálogo de lugares</h2><p className="muted">Agrega referencias locales para encontrarlas al pedir un viaje.</p><button className="primary" disabled={busy} onClick={()=>edit()}>Agregar lugar</button></section>
    <section className="trip-card catalog-import">
      <h2>Importar por lotes</h2><p className="muted">JSON UTF-8 · hasta 1.000 lugares y 5 MB por archivo. Se validará antes de guardar.</p>
      <div className="catalog-downloads"><a href="/catalog/places.example.json" download>Descargar ejemplo</a><a href="/catalog/places.schema.json" download>Descargar esquema JSON</a><a href="/catalog/import-guide.md" download>Guía para tu script</a></div>
      <label>Archivo JSON<input type="file" accept=".json,application/json" disabled={busy} onChange={e=>void readFile(e.target.files?.[0])}/></label>
      {errors.length>0&&<div className="catalog-report" role="alert"><strong>Revisa estos detalles</strong><ul>{errors.slice(0,20).map((error,i)=><li key={i}>{error}</li>)}</ul>{errors.length>20&&<small>Hay {errors.length} errores en total.</small>}</div>}
      {plan&&<div className="catalog-import-preview">
        <p><strong>{plan.places.length} lugares válidos</strong> · {plan.batches.length} bloques</p>
        <p className="muted">Una coincidencia de source + external_id actualiza el lugar existente. Los campos de texto omitidos se guardan vacíos.</p>
        {plan.warnings.length>0&&<details><summary>{plan.warnings.length} advertencias de ubicación</summary><ul>{plan.warnings.slice(0,20).map((warning,i)=><li key={i}>{warning}</li>)}</ul></details>}
        <ul className="catalog-preview-list">{plan.places.slice(0,5).map(place=><li key={place.source+place.external_id}><strong>{place.name}</strong><small>{place.latitude}, {place.longitude} · {place.source} / {place.external_id}</small></li>)}</ul>
        {plan.places.length>5&&<small>Vista previa de los primeros 5 lugares.</small>}
        <p role="status">Procesados: {plan.completed}/{plan.places.length} · Nuevos: {plan.inserted} · Actualizados: {plan.updated}</p>
        {plan.completed<plan.places.length&&<button className="primary" disabled={busy} onClick={()=>void importPlaces()}>{busy?'Importando…':plan.completed?'Continuar importación':`Importar ${plan.places.length} lugares`}</button>}
      </div>}
    </section>
    </div>
    <section className="trip-card catalog-results"><h2>Lugares registrados</h2>
      <form className="catalog-filter" onSubmit={e=>{e.preventDefault();setListHeight(0);setPage(0);setFilter(query);}}><label>Buscar en el catálogo<input value={query} maxLength={120} onChange={e=>setQuery(e.target.value)} placeholder="Nombre, alias o municipio"/></label><button className="secondary" disabled={busy}>Buscar</button></form>
      <p className="muted">{total} resultados · {active} activos</p>
      <div ref={list} style={{minHeight:listHeight||undefined}} aria-busy={loading}>
      {loading&&!items.length?<p role="status">Cargando lugares…</p>:!items.length?<p className="muted">No hay lugares para esta búsqueda.</p>:items.slice((loadedPage%5)*5,(loadedPage%5)*5+5).map(place=><article className="catalog-item" key={place.id}>
        <div className="row"><strong>{place.name}</strong><span className={'pill '+(place.active?'green':'')}>{place.active?'Activo':'Inactivo'}</span></div>
        <p className="muted">{[place.address,place.municipality].filter(Boolean).join(', ')||'Sin dirección adicional'}</p><small>{place.source} / {place.external_id}</small>
        <div className="catalog-item-actions"><button className="secondary" disabled={busy||loading} onClick={()=>edit(place)}>Editar</button></div>
      </article>)}
      </div>
      <div className="catalog-pages"><button className="secondary" disabled={!page||busy||loading} onClick={()=>turn(page-1)}>Anterior</button><span>Página {page+1} de {Math.max(1,Math.ceil(total/5))}</span><button className="secondary" disabled={(page+1)*5>=total||busy||loading} onClick={()=>turn(page+1)}>Siguiente</button></div>
    </section>
    <Toast message={message}/>
    <dialog ref={dialog} tabIndex={-1} className="action-sheet catalog-editor" aria-label="Editar lugar" onClose={()=>setEditor(null)} onCancel={e=>{if(busy)e.preventDefault();}}>
      {editor&&<form onSubmit={save}><h2>{editor.editing?'Editar lugar':'Agregar lugar'}</h2>
        <label>Nombre<input required maxLength={110} value={editor.name} onChange={e=>change('name',e.target.value)}/></label>
        <div className="two"><label>Latitud<input required type="number" step="any" min="-90" max="90" value={editor.latitude} onChange={e=>change('latitude',e.target.value)}/></label><label>Longitud<input required type="number" step="any" min="-180" max="180" value={editor.longitude} onChange={e=>change('longitude',e.target.value)}/></label></div>
        <button type="button" className="secondary" onClick={()=>setMap(value=>!value)}>{map?'Ocultar mapa':'Fijar punto en el mapa'}</button>
        {map&&<div className="catalog-editor-map"><JourneyMap origin={null} destination={point} picking onPick={p=>setEditor(current=>current?{...current,latitude:p.lat.toFixed(6),longitude:p.lng.toFixed(6)}:null)}/></div>}
        <label>Otros nombres (uno por línea)<textarea rows={2} value={editor.aliases} onChange={e=>change('aliases',e.target.value)}/></label>
        <label>Dirección<input maxLength={200} value={editor.address} onChange={e=>change('address',e.target.value)}/></label>
        <label>Municipio o sector<input maxLength={100} value={editor.municipality} onChange={e=>change('municipality',e.target.value)}/></label>
        <label>Categoría<input maxLength={60} value={editor.category} onChange={e=>change('category',e.target.value)}/></label>
        <label>Referencia de acceso<textarea rows={2} maxLength={240} value={editor.reference} onChange={e=>change('reference',e.target.value)}/></label>
        <label>Origen (source)<input required maxLength={40} readOnly={editor.editing} value={editor.source} onChange={e=>change('source',e.target.value)}/></label>
        <label>Identificador estable (external_id)<input required maxLength={160} readOnly={editor.editing} value={editor.external_id} onChange={e=>change('external_id',e.target.value)}/></label>
        <label>URL de referencia (opcional)<input type="url" maxLength={2048} value={editor.source_url} onChange={e=>change('source_url',e.target.value)}/></label>
        <label className="check"><input type="checkbox" checked={editor.active} onChange={e=>change('active',e.target.checked)}/>Lugar activo (visible en búsquedas)</label>
        <button className="primary" disabled={busy}>{busy?'Guardando…':'Guardar lugar'}</button><button type="button" className="secondary" disabled={busy} onClick={()=>dialog.current?.close()}>Cancelar</button>
      </form>}
      <Toast message={message}/>
    </dialog>
  </div>;
}
