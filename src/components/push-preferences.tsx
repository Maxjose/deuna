"use client";
import { useEffect, useState } from 'react';
import { browserClient } from '@/lib/supabase/client';
import { disconnectPushDevice } from '@/lib/push-device';
import { Toast, useNotice } from './toast';
export function PushPreferences() {
  const [supported,setSupported]=useState(false), [loading,setLoading]=useState(true), [busy,setBusy]=useState(false),
    [endpoint,setEndpoint]=useState(''),[promotions,setPromotions]=useState(false),[blocked,setBlocked]=useState(false),[configured,setConfigured]=useState(false);
  const {message,notify}=useNotice('push-preferences');
  useEffect(()=>{
    let active=true;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),8000);
    async function load() {
      const available = isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
      if(!active)return;
      setSupported(available);
      if(available) {
        setBlocked(Notification.permission==='denied');
        try {
          const config=await (await fetch('/api/push/config',{signal:controller.signal})).json();
          if(active)setConfigured(!!config.publicKey);
          const registration=await navigator.serviceWorker.getRegistration();
          const subscription=await registration?.pushManager.getSubscription();
          if(!active)return;
          if(subscription && Notification.permission==='granted') {
            const {data,error}=await browserClient().rpc('push_manage',{action:'info',payload:{endpoint:subscription.endpoint}});
            if(error)throw error;
            if(active && data.enabled){setEndpoint(subscription.endpoint);setPromotions(data.promotions);}
          }
        } catch {if(active)notify('No pudimos consultar tus notificaciones.');}
      }
      if(active)setLoading(false);
      clearTimeout(timeout);
    }
    void load();return()=>{active=false;controller.abort();clearTimeout(timeout);};
  },[notify]);
  async function enable() {
    setBusy(true);
    try {
      const permission=await Notification.requestPermission();
      if(permission!=='granted'){setBlocked(permission==='denied');notify('Permite las notificaciones para activarlas.');return;}
      const response=await fetch('/api/push/config');const config=await response.json();
      if(!config.publicKey)throw Error();
      const bytes=Uint8Array.from(atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
      const registration=await navigator.serviceWorker.register('/sw.js',{scope:'/'});
      await navigator.serviceWorker.ready;
      const subscription=await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
      const {data,error}=await browserClient().rpc('push_manage',{action:'subscribe',payload:subscription.toJSON()});
      if(error)throw error;
      setEndpoint(subscription.endpoint);setPromotions(data.promotions);
      notify('Notificaciones de viajes activadas.');
    }catch{notify('No pudimos activar las notificaciones. Revisa los permisos e inténtalo de nuevo.');}
    finally{setBusy(false);}
  }
  async function changePromotions(value:boolean) {
    setBusy(true);
    const {error}=await browserClient().rpc('push_manage',{action:'preferences',payload:{endpoint,promotions:value}});
    if(error)notify('No pudimos guardar esta preferencia.');
    else{setPromotions(value);notify(value?'Promociones activadas.':'Promociones desactivadas.');}
    setBusy(false);
  }
  async function disable() {
    setBusy(true);
    try{await disconnectPushDevice();setEndpoint('');setPromotions(false);notify('Notificaciones desactivadas en este dispositivo.');}
    catch{notify('No pudimos desactivarlas. Inténtalo de nuevo.');}
    finally{setBusy(false);}
  }
  return <article className="trip-card"><h2>Notificaciones</h2>
    {loading?<p role="status">Comprobando este dispositivo…</p>:!supported?<p className="muted">Este navegador no permite activar notificaciones. En iPhone, agrega De1na a la pantalla de inicio y ábrela desde allí (iOS 16.4 o posterior).</p>:!configured?<p className="muted">Estamos preparando las notificaciones. Vuelve a comprobarlo más tarde.</p>:endpoint?<>
      <p className="muted">Avisos de tus viajes activos en este dispositivo.</p>
      <label className="check"><input type="checkbox" checked={promotions} disabled={busy} onChange={e=>void changePromotions(e.target.checked)}/>Recibir promociones y novedades de De1na</label>
      <button className="secondary" disabled title="Prueba deshabilitada">Enviar notificación de prueba</button>
      <button className="text" disabled={busy} onClick={()=>void disable()}>Desactivar en este dispositivo</button>
    </>:<><p className="muted">Recibe avisos de tus viajes aunque De1na no esté en pantalla.</p>{blocked?<p className="muted">Las notificaciones están bloqueadas. Habilítalas en los ajustes del navegador o del sistema.</p>:<button className="primary" disabled={busy} onClick={()=>void enable()}>{busy?'Activando…':'Activar notificaciones'}</button>}</>}
    <Toast message={message}/>
  </article>;
}
