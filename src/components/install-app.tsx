"use client";
import { useEffect, useState } from "react";
import { Toast, useNotice } from "./toast";
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const { message, notify } = useNotice("installation");
  useEffect(() => {
    setInstalled(window.matchMedia("(display-mode: standalone)").matches);
    const available = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallEvent);
    };
    const done = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", available);
    window.addEventListener("appinstalled", done);
    return () => {
      window.removeEventListener("beforeinstallprompt", available);
      window.removeEventListener("appinstalled", done);
    };
  }, []);
  if (installed)
    return null;
  return (
    <div className="trip-card install-panel">
      <strong>Lleva De1na contigo</strong>
      <p className="muted">
        Agrégala a tu pantalla de inicio para abrirla como una app.
      </p>
      {prompt ? (
        <button
          className="secondary"
          onClick={async () => {
            try {
              notify("");
              await prompt.prompt();
              await prompt.userChoice;
            } catch {
              notify("No se pudo abrir la instalación. Usa Agregar a pantalla de inicio en el menú del navegador.");
            } finally {
              setPrompt(null);
            }
          }}
        >
          Instalar De1na
        </button>
      ) : (
        <p className="muted">
          En iPhone: Compartir → Agregar a inicio. En Android: menú del
          navegador → Instalar aplicación o Agregar a pantalla de inicio.
        </p>
      )}
      <Toast message={message} />
    </div>
  );
}
