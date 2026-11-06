"use client";
import {useCallback,useEffect,useMemo,useState} from 'react';
import {browserClient} from '@/lib/supabase/client';
import {DOCUMENTS,documentExtension} from '@/lib/driver-documents';
import {AppIcon} from './app-icon';
type Document={kind:string;path:string;status:'pending'|'approved'|'rejected';reason:string};
type State={ready:boolean;exempt:boolean;documents:Document[]};
const STATUS={pending:'Pendiente de revisión',approved:'Aprobado',rejected:'Rechazado'};
export function DriverDocuments({driverId,admin=false}:{driverId:string;admin?:boolean}){
 const client=useMemo(()=>browserClient(),[]);
 const [data,setData]=useState<State|null>(null),[busy,setBusy]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [reasons,setReasons]=useState<Record<string,string>>({});
 const [uploadName,setUploadName]=useState('');
 const load=useCallback(async()=>{
  const {data,error}=await client.rpc('driver_documents',{action:'list',payload:{driver_id:driverId}});
  if(error){setError('No pudimos cargar los documentos.');return;}
  setData(data);setError('');
 },[client,driverId]);
 useEffect(()=>{void load();},[load]);
 async function change(action:string,payload:Record<string,unknown>){
  const {data,error}=await client.rpc('driver_documents',{action,payload:{driver_id:driverId,...payload}});
  if(error)throw new Error(error.message==='Documento actualizado'?'El archivo cambió. Actualiza los documentos antes de revisarlo.':error.message==='Motivo requerido'?'Escribe el motivo del rechazo.':'No pudimos guardar el cambio.');
  setData(data);setMessage('Cambio guardado.');
 }
 async function run(key:string,task:()=>Promise<void>){
  if(busy)return;setBusy(key);setError('');setMessage('');
  try{await task();}catch(e){setError((e as Error).message||'No pudimos completar la acción.');}finally{setBusy('');}
 }
 async function upload(kind:string,file:File){
  const extension=documentExtension(file),path=`${driverId}/${kind}/${crypto.randomUUID()}.${extension}`;
  const old=data?.documents.find(d=>d.kind===kind)?.path;
  const {error}=await client.storage.from('driver-documents').upload(path,file,{contentType:file.type,upsert:false});
  if(error)throw new Error('No pudimos subir el archivo. Revisa tu conexión e inténtalo de nuevo.');
  try{await change('submit',{kind,path});}catch(e){await client.storage.from('driver-documents').remove([path]);throw e;}
  if(old&&old!==path)await client.storage.from('driver-documents').remove([old]);
 }
 async function view(doc:Document){
  const tab=window.open('about:blank','_blank');if(tab)tab.opener=null;
  const {data,error}=await client.storage.from('driver-documents').createSignedUrl(doc.path,60);
  if(error){tab?.close();throw new Error('No pudimos abrir el documento.');}
  if(tab)tab.location.href=data.signedUrl;else window.location.assign(data.signedUrl);
 }
 return <section className="driver-documents">
  <h2>Documentos</h2>
  <p>Para aceptar viajes necesitas los cinco documentos aprobados por administración. Adjunta JPG, PNG o PDF de hasta 10 MB por documento.</p>
  {error&&<p role="alert" className="payment-error">{error}</p>}
  {message&&<p role="status">{message}</p>}
  <button type="button" className="secondary" disabled={!!busy} onClick={()=>void load()}>Actualizar documentos</button>
  {!data?<p role="status">{error?'Reintenta la carga.':'Cargando documentos…'}</p>:<>
   <p className="availability-notice" role="status">{data.exempt?'Exención de documentos para pruebas activa.':data.ready?'Documentación aprobada.':'Documentación incompleta o pendiente: no puedes aceptar nuevos viajes.'}</p>
   {admin&&<label className="payment-switch"><input type="checkbox" role="switch" checked={data.exempt} disabled={!!busy} onChange={e=>{const enabled=e.target.checked;void run('exempt',()=>change('exempt',{enabled}));}}/><span><strong>Exención de documentos para pruebas</strong><small>Permite aceptar viajes sin documentos. No aprueba los archivos ni omite los requisitos de cuenta y plan.</small></span></label>}
   <div className="document-list">{DOCUMENTS.map(([kind,title])=>{
    const doc=data.documents.find(d=>d.kind===kind);
    return <article className="document-item" key={kind}>
     <div><h3>{title}</h3><span className={'pill '+(doc?.status==='approved'?'green':doc?.status==='rejected'?'cancelled':'')}>{doc?STATUS[doc.status]:'Sin adjuntar'}</span></div>
     {doc?.reason&&<p>Motivo del rechazo: {doc.reason}</p>}
     {doc&&<button type="button" className="secondary" disabled={!!busy} onClick={()=>void run(kind,()=>view(doc))}>Ver documento</button>}
     {!admin&&<label className={'document-upload'+(busy?' is-disabled':'')}><input className="document-upload-input" type="file" aria-label={`${doc?'Reemplazar':'Adjuntar'} ${title}`} accept="image/jpeg,image/png,application/pdf" disabled={!!busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file){setUploadName(file.name);void run(kind,()=>upload(kind,file)).finally(()=>setUploadName(''));}}}/><span className="document-upload-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 16V3m-4 4 4-4 4 4M4 15v6h16v-6"/></svg></span><span><strong>{busy===kind&&uploadName?'Subiendo documento…':doc?'Reemplazar documento':'Adjuntar documento'}</strong><small>{busy===kind&&uploadName?uploadName:'JPG, PNG o PDF · Hasta 10 MB'}</small></span><AppIcon name="arrow"/></label>}
     {!admin&&doc?.status==='approved'&&<small>Si lo reemplazas, el nuevo archivo necesitará otra aprobación.</small>}
     {admin&&doc&&<><label>Motivo si se rechaza<textarea maxLength={500} value={reasons[kind]||''} disabled={!!busy} onChange={e=>setReasons(r=>({...r,[kind]:e.target.value}))}/></label><div className="document-actions"><button type="button" className="secondary" disabled={!!busy||!(reasons[kind]?.trim().length>=3)} onClick={()=>void run(kind,()=>change('review',{kind,path:doc.path,approve:false,reason:reasons[kind]}))}>Rechazar</button><button type="button" className="primary" disabled={!!busy||doc.status==='approved'} onClick={()=>void run(kind,()=>change('review',{kind,path:doc.path,approve:true}))}>Aprobar</button></div></>}
     {busy===kind&&<p role="status">Procesando…</p>}
    </article>;
   })}</div>
  </>}
 </section>;
}
