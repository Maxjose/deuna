"use client";
import { useEffect } from "react";

const CLOSE_MS = 240;

/**
 * Animación global de hojas y ventanas emergentes (<dialog class="action-sheet">):
 * entran deslizándose hacia arriba y salen deslizándose hacia abajo, se cierren por código,
 * con Escape/atrás o tocando fuera. Respeta "reducir movimiento" del sistema.
 */
export function SheetMotion() {
  useEffect(() => {
    const proto = HTMLDialogElement.prototype;
    const nativeClose = proto.close;
    const animated = (d: HTMLDialogElement) => d.classList.contains("action-sheet") && d.open && !matchMedia("(prefers-reduced-motion: reduce)").matches;
    proto.close = function (this: HTMLDialogElement, value?: string) {
      if (!animated(this) || this.classList.contains("is-closing")) { this.classList.remove("is-closing"); return nativeClose.call(this, value); }
      this.classList.add("is-closing");
      setTimeout(() => { this.classList.remove("is-closing"); if (this.open) nativeClose.call(this, value); }, CLOSE_MS);
    };
    // Escape o botón/gesto de atrás: animar en vez de cerrar de golpe (si el diálogo no bloqueó el cierre).
    const onCancel = (e: Event) => {
      const d = e.target as HTMLDialogElement;
      if (!(d instanceof HTMLDialogElement) || !animated(d)) return;
      // Si el propio diálogo bloquea el cierre (p. ej. mientras guarda), se respeta.
      let blocked = false;
      const prevent = e.preventDefault.bind(e);
      e.preventDefault = () => { blocked = true; prevent(); };
      prevent();
      setTimeout(() => { if (!blocked) d.close(); }, 0);
    };
    document.addEventListener("cancel", onCancel, true);
    return () => { proto.close = nativeClose; document.removeEventListener("cancel", onCancel, true); };
  }, []);
  return null;
}
