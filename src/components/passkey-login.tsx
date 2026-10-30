"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase/client";
import { usePasskeys } from "@/lib/use-passkeys";
export function PasskeyLogin({
  disabled,
  onBusyChange,
}: {
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const { state } = usePasskeys(),
    router = useRouter();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
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
          "No se completó el acceso rápido. Puedes volver a intentarlo o entrar con tu contraseña.",
        );
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setMessage(
        "No se completó el acceso rápido. Inténtalo de nuevo o usa tu contraseña.",
      );
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }
  return (
    <div className="passkey-login">
      <div className="auth-divider">
        <span>o entra más rápido</span>
      </div>
      <button
        type="button"
        className="secondary"
        disabled={busy || disabled}
        onClick={() => void signIn()}
      >
        {busy ? "Confirma en tu dispositivo…" : "Entrar con passkey"}
      </button>
      <p className="muted">
        Usa Face ID, huella o el desbloqueo de tu dispositivo.
      </p>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
