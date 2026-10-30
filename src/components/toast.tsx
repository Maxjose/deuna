"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export function useNotice(scope: string) {
  // Each visit has its own identity, including when an old request finishes later.
  const context = useMemo(() => ({ scope }), [scope]);
  const active = useRef(context);
  active.current = context;
  const [notice, setNotice] = useState<{ context: object; text: string } | null>(null);
  const notify = useCallback((text: string) => {
    if (active.current !== context) return;
    if (text) setNotice({ context, text });
    else setNotice(current => current?.context === context ? null : current);
  }, [context]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(current => current === notice ? null : current), 3000);
    return () => clearTimeout(timer);
  }, [notice]);
  return { message: notice?.context === context ? notice.text : "", notify };
}

export function Toast({ message }: { message: string }) {
  return message ? <div className="app-toast" role="status" aria-live="polite">{message}</div> : null;
}
