"use client";
import {useEffect,useRef,useState} from 'react';
import type {PDFDocumentProxy} from 'pdfjs-dist';
import {browserClient} from '@/lib/supabase/client';
import {closeOnBackdrop} from '@/lib/dialog';
import {AppIcon} from './app-icon';

export default function DocumentPreview({path,title,onClose}:{path:string;title:string;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),canvas=useRef<HTMLCanvasElement>(null),body=useRef<HTMLDivElement>(null);
 const [pdf,setPdf]=useState<PDFDocumentProxy|null>(null),[image,setImage]=useState(''),[page,setPage]=useState(1),[zoom,setZoom]=useState(1);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{dialog.current?.showModal();},[]);
 useEffect(()=>{
  let active=true,url='';let task:ReturnType<typeof import('pdfjs-dist').getDocument>|undefined;
  setLoading(true);setError('');setPdf(null);setImage('');setPage(1);
  async function load(){
   const {data,error}=await browserClient().storage.from('driver-documents').download(path);
   if(error)throw error;if(!active)return;
   if(path.endsWith('.pdf')){
    const engine=await import('pdfjs-dist');if(!active)return;
    const bytes=new Uint8Array(await data.arrayBuffer());if(!active)return;
    engine.GlobalWorkerOptions.workerSrc='/pdfjs/pdf.worker.min.mjs';
    task=engine.getDocument({data:bytes,cMapUrl:'/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/pdfjs/standard_fonts/',wasmUrl:'/pdfjs/wasm/'});
    const document=await task.promise;
    if(active)setPdf(document);
   }else{url=URL.createObjectURL(data);if(active){setImage(url);setLoading(false);}}
  }
  void load().catch(()=>{if(active){setError('No pudimos mostrar el documento. Reintenta o comprueba que el archivo sea válido y no tenga contraseña.');setLoading(false);}});
  return()=>{active=false;if(url)URL.revokeObjectURL(url);void task?.destroy();};
 },[path,attempt]);
 useEffect(()=>{
  if(!pdf)return;let active=true;let render:ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']>|undefined;
  setLoading(true);setError('');
  void (async()=>{
   const sheet=await pdf.getPage(page);if(!active||!canvas.current)return;
   const original=sheet.getViewport({scale:1});
   const width=Math.max(240,(body.current?.clientWidth||720)-32);
   const scale=Math.min(width/original.width,1.5)*zoom;
   const viewport=sheet.getViewport({scale});
   const ratio=Math.min(window.devicePixelRatio||1,2,4096/Math.max(viewport.width,viewport.height));
   const element=canvas.current;element.width=Math.floor(viewport.width*ratio);element.height=Math.floor(viewport.height*ratio);
   element.style.width=`${viewport.width}px`;element.style.height=`${viewport.height}px`;
   render=sheet.render({canvas:element,viewport,transform:[ratio,0,0,ratio,0,0]});await render.promise;
   if(active){setLoading(false);body.current?.scrollTo(0,0);}
  })().catch(()=>{if(active){setError('No pudimos mostrar esta página.');setLoading(false);}});
  return()=>{active=false;render?.cancel();};
 },[pdf,page,zoom]);
 return <dialog ref={dialog} className="document-preview" aria-labelledby="document-preview-title" onClick={closeOnBackdrop} onClose={event=>{if(event.target===event.currentTarget)onClose();}}>
  <header><h2 id="document-preview-title">{title}</h2><button type="button" className="icon-button" aria-label="Cerrar documento" onClick={()=>dialog.current?.close()}><AppIcon name="close"/></button></header>
  {pdf&&<nav className="document-preview-tools" aria-label="Controles del documento"><button className="secondary" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Anterior</button><span>Página {page} de {pdf.numPages}</span><button className="secondary" disabled={page>=pdf.numPages} onClick={()=>setPage(p=>p+1)}>Siguiente</button><button className="secondary" aria-label="Reducir documento" disabled={zoom<=1} onClick={()=>setZoom(z=>Math.max(1,z-.5))}>−</button><button className="secondary" aria-label="Ampliar documento" disabled={zoom>=3} onClick={()=>setZoom(z=>Math.min(3,z+.5))}>+</button></nav>}
  <div className="document-preview-body" ref={body}>
   {loading&&<p role="status">Cargando documento…</p>}
   {error&&<div role="alert"><p>{error}</p><button className="secondary" onClick={()=>setAttempt(n=>n+1)}>Reintentar</button></div>}
   {image&&<img src={image} alt={title} onError={()=>setError('No pudimos mostrar la imagen. Reintenta con un archivo válido.')}/>}
   {pdf&&<canvas ref={canvas} aria-label={`${title}, página ${page} de ${pdf.numPages}`} role="img"/>}
  </div>
 </dialog>;
}
