"use client";
import { useEffect, useState, useCallback } from "react";
export function usePasskeys() {
  const [state, setState] = useState<
    "loading" | "unsupported" | "disabled" | "enabled" | "error"
  >("loading");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!window.isSecureContext || !window.PublicKeyCredential) {
      setState("unsupported");
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    setState("loading");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
      key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) {
      setState("disabled");
      clearTimeout(timeout);
      return;
    }
    let active = true;
    fetch(url + "/auth/v1/settings", {
      headers: { apikey: key },
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((data) => {
        if (active)
          setState(data.passkeys_enabled === true ? "enabled" : "disabled");
      })
      .catch(() => {
        if (active) setState("error");
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [revision]);
  return { state, retry: useCallback(() => setRevision((n) => n + 1), []) };
}
