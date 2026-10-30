"use client";
import { useEffect } from "react";
export function PwaRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        console.warn("De1na: no se pudo habilitar la pantalla sin conexión.");
      });
    }
  }, []);
  return null;
}
