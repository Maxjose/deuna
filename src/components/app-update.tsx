"use client";
import { useEffect, useState } from "react";
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
  if (need === "required") {
    return (
      <div className="app-update-required" role="alertdialog" aria-modal="true" aria-labelledby="app-update-title">
        <div className="app-update-card">
          <img src="/icons/icon-192.png" width="72" height="72" alt="" />
          <h2 id="app-update-title">Actualiza De1na para continuar</h2>
          <p>Esta versión de la app ya no es compatible. La nueva versión {release.versionCode} trae mejoras necesarias para tus viajes.</p>
          {release.notes && <p className="app-update-notes">{release.notes}</p>}
          {download}
          {help}
          <small>Versión instalada: {installed || "anterior"}</small>
        </div>
      </div>
    );
  }
  return (
    <aside className="app-update-banner" role="status" aria-label="Actualización disponible">
      <span className="app-update-icon"><AppIcon name="download" /></span>
      <div className="app-update-text">
        <strong>Nueva versión de De1na</strong>
        <span>{release.notes || "Mejoras y correcciones para tus viajes."}</span>
        {help}
      </div>
      <div className="app-update-actions">
        {download}
        <button type="button" className="text" onClick={() => {
          try { sessionStorage.setItem(DISMISS_KEY, String(release.versionCode)); } catch { /* sin almacenamiento */ }
          setDismissed(true);
        }}>Ahora no</button>
      </div>
    </aside>
  );
}
