"use client";

import { useEffect } from "react";

export function HapticFeedback() {
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!event.isTrusted || !(event.target instanceof Element)) return;
      const button = event.target.closest('button, [role="button"]');
      if (!button || button.matches(':disabled, [aria-disabled="true"]')) return;
      if (typeof navigator.vibrate === "function") navigator.vibrate(10);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
