"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { detectTwa } from "@/lib/twa";
import { readInstalledVersion, updateNeed, type AppRelease, type UpdateNeed } from "@/lib/app-update";
import { AppIcon } from "./app-icon";

const DISMISS_KEY = "de1na-update-dismissed";

/** Aviso de nueva versión del APK. Solo dentro de la app Android; obligatorio si la versión es muy antigua. */
export function AppUpdate() {
  const [release, setRelease] = useState<AppRelease | null>(null);
  const [need, setNeed] = useState<UpdateNeed>("none");
  const [installed, setInstalled] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const dialog=useRef<HTMLDialogElement>(null);
  const visible=need!=='none'&&!!release&&!(need==='optional'&&dismissed);
  useLayoutEffect(()=>{
    if(visible&&!dialog.current?.open)dialog.current?.showModal();
    if(visible)dialog.current?.focus({preventScroll:true});
  },[visible]);
  function dismiss(){
    if(need!=='optional'||!release)return;
    try{sessionStorage.setItem(DISMISS_KEY,String(release.versionCode));}catch{/* sin almacenamiento */}
    setDismissed(true);
  }

  useEffect(() => {
    if (!detectTwa()) return;
    const current = readInstalledVersion();
    setInstalled(current);
    let alive = true;
    const check = async () => {
      try {
        const response = await fetch("/api/app-version", { cache: "no-store" });
        if (!response.ok) return;
        const { release } = (await response.json()) as { release: AppRelease | null };
        if (!alive) return;
        const next = updateNeed(current, release);
        setRelease(release);
        setNeed(next);
        let skipped: string | null = null;
        try { skipped = sessionStorage.getItem(DISMISS_KEY); } catch { /* sin almacenamiento */ }
        setDismissed(next === "optional" && !!release && skipped === String(release.versionCode));
      } catch { /* sin conexión: se intentará de nuevo al volver a la app */ }
    };
    void check();
    const resume = () => { if (!document.hidden) void check(); };
    document.addEventListener("visibilitychange", resume);
    return () => { alive = false; document.removeEventListener("visibilitychange", resume); };
  }, []);

  if (need === "none" || !release || (need === "optional" && dismissed)) return null;
  const download = (
    <a className="primary app-update-download" href={release.apkUrl} onClick={() => setDownloading(true)}>
      <AppIcon name="download" />
      {downloading ? "Descargando…" : need === "required" ? "Descargar actualización" : "Actualizar"}
    </a>
  );
  const help = downloading && (
    <p className="app-update-help" role="status">
      Cuando termine la descarga, ábrela desde la notificación y toca <strong>Actualizar</strong>. Tu sesión se mantiene.
    </p>
  );
  return (
    <dialog ref={dialog} tabIndex={-1} className="app-update-screen" aria-labelledby="app-update-title" onCancel={event=>{event.preventDefault();dismiss();}}>
      <div className="app-update-content">
        <img className="app-update-logo" src="/icons/icon-512.png" width="104" height="104" alt="De1na"/>
        <span className="app-update-eyebrow">{need==='required'?'ACTUALIZACIÓN NECESARIA':'UNA MEJOR VUELTA TE ESPERA'}</span>
        <h1 id="app-update-title">{need==='required'?'Actualiza para seguir viajando':'De1na sigue mejorando'}</h1>
        <p>{need==='required'?'Necesitas instalar la nueva versión para continuar usando De1na.':'Tenemos una nueva versión con mejoras para acompañarte en cada viaje.'}</p>
        {release.notes&&<div className="app-update-release"><AppIcon name="download"/><p>{release.notes}</p></div>}
        <div className="app-update-screen-actions">{download}{need==='optional'&&<button type="button" className="text" onClick={dismiss}>Ahora no</button>}</div>
        {help}
        <small>Versión instalada: {installed||'anterior'} · Nueva versión: {release.versionCode}</small>
      </div>
    </dialog>
  );
}
