"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase/client";
import { usePasskeys } from "@/lib/use-passkeys";
import { AppIcon } from "./app-icon";
import { Toast, useNotice } from "./toast";
export function PasskeyLogin({
  disabled,
  onBusyChange,
}: {
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const { state } = usePasskeys(),
    router = useRouter();
  const [busy, setBusy] = useState(false);
  const { message, notify: setMessage } = useNotice("passkey-login");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  if (state !== "enabled") return null;
  async function signIn() {
    if (busy || disabled) return;
    setBusy(true);
    onBusyChange(true);
    setMessage("");
    controller.current = new AbortController();
    try {
      const { data, error } = await browserClient().auth.signInWithPasskey({
        options: { signal: controller.current.signal },
      });
      if (error || !data?.session) {
        setMessage(
          "No pudimos entrar. Usa tu contraseña.",
        );
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setMessage(
        "No pudimos entrar. Usa tu contraseña.",
      );
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="passkey-button"
        aria-label="Entrar con passkey"
        title="Entrar con passkey"
        aria-busy={busy}
        disabled={busy || disabled}
        onClick={() => void signIn()}
      >
        <AppIcon name="fingerprint" />
      </button>
      <Toast message={message} />
    </>
  );
}
