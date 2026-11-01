"use client";
import {useEffect,useState,type ReactNode} from 'react';
import {installPlatform,requiresInstallation} from '@/lib/install-platform';
import {detectTwa} from '@/lib/twa';
import {AppIcon} from './app-icon';
const APK_URL='https://github.com/Maxjose/deuna/releases/download/apk-pruebas/de1na-pruebas.apk';
type InstallPrompt=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};

export function InstallGate({children}:{children:ReactNode}){
 const [mode,setMode]=useState<'checking'|'allowed'|'ios'|'android'>('checking');
 const [prompt,setPrompt]=useState<InstallPrompt|null>(null),[manual,setManual]=useState(false),[installed,setInstalled]=useState(false),[busy,setBusy]=useState(false);
 useEffect(()=>{
  const display=window.matchMedia('(display-mode: standalone)'),full=window.matchMedia('(display-mode: fullscreen)');
  const platform=installPlatform(navigator.userAgent,navigator.maxTouchPoints);
  const update=()=>{
   const standalone=display.matches||full.matches||(navigator as Navigator&{standalone?:boolean}).standalone===true;
   setMode(requiresInstallation(platform,standalone,detectTwa())?(platform==='ios'?'ios':'android'):'allowed');
  };
  const available=(event:Event)=>{if(platform==='desktop')return;event.preventDefault();setPrompt(event as InstallPrompt);};
  const done=()=>{setInstalled(true);setPrompt(null);setManual(false);};
  update();display.addEventListener('change',update);full.addEventListener('change',update);
  window.addEventListener('beforeinstallprompt',available);window.addEventListener('appinstalled',done);
  return()=>{display.removeEventListener('change',update);full.removeEventListener('change',update);window.removeEventListener('beforeinstallprompt',available);window.removeEventListener('appinstalled',done);};
 },[]);
 if(mode==='checking')return <div className="install-gate-check" role="status" aria-label="Preparando De1na"/>;
 if(mode==='allowed')return children;
 return <main className="install-gate">
  <div className="install-gate-orbit" aria-hidden="true"/>
  <div className="install-gate-content">
   <header className="install-gate-brand"><span>De<span>1</span>na</span><span className="install-beta">BETA</span></header>
   <div className="install-gate-icon"><img src="/icons/icon-512.png" width="112" height="112" alt="De1na"/></div>
   <span className="install-eyebrow">TU PRÓXIMA VUELTA EMPIEZA AQUÍ</span>
   <h1>Tu destino,<br/><em>a un toque.</em></h1>
   <p className="install-gate-intro">Instala De1na y lleva tus viajes contigo. Ábrela desde tu pantalla de inicio para comenzar.</p>
   <div className="install-gate-card">
    <h2>{installed?'De1na ya está instalada':mode==='ios'?'De1na en tu iPhone':'Viaja desde la app'}</h2>
    {installed?<p>Busca el icono de De1na en tu teléfono y abre la aplicación para viajar.</p>:mode==='ios'?<>
     <p>Instálala desde tu navegador en unos pasos:</p>
     <ol><li><span>1</span><div>Toca el botón <strong>Compartir</strong> <ShareIcon/> de tu navegador (en la barra o en el menú).</div></li><li><span>2</span><div>Elige <strong>Añadir a pantalla de inicio</strong>.</div></li><li><span>3</span><div>Si aparece, activa <strong>Abrir como app web</strong> y toca <strong>Añadir</strong>. Luego abre De1na desde su icono.</div></li></ol>
    </>:<>
     <p>Descarga la app para Android e instálala en tu teléfono.</p>
     <a className="primary install-gate-button" href={APK_URL} onClick={()=>setManual(true)}><DownloadIcon/>Descargar app para Android<AppIcon name="arrow"/></a>
     {manual&&<div className="install-manual" role="status">Cuando termine la descarga, ábrela desde la notificación y toca <strong>Instalar</strong>. Si Android lo pide, permite instalar apps de esta fuente. Luego abre De1na desde su icono.</div>}
    </>}
   </div>
   <footer>¿Vamos? <strong>¡De una!</strong></footer>
  </div>
 </main>;
}
function ShareIcon(){return <svg className="install-inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M12 16V3m-4 4 4-4 4 4M7 10H4v11h16V10h-3"/></svg>;}
function DownloadIcon(){return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></svg>;}
