"use client";
import { useEffect, useState } from "react";
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [error, setError] = useState(false);
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
    <div className="install-panel">
      <strong>Lleva De1na contigo</strong>
      <p className="muted">
        Agrégala a tu pantalla de inicio para abrirla como una app.
      </p>
      {prompt ? (
        <button
          className="secondary"
          onClick={async () => {
            try {
              setError(false);
              await prompt.prompt();
              await prompt.userChoice;
            } catch {
              setError(true);
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
      {error && (
        <p role="status">
          No se pudo abrir la instalación. Usa la opción Agregar a pantalla de
          inicio del navegador.
        </p>
      )}
    </div>
  );
}
