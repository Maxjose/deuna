"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase/client";
import { PasskeyLogin } from "./passkey-login";
import { Toast, useNotice } from "./toast";
export function AuthForm({
  configured,
  reset = false,
}: {
  configured: boolean;
  reset?: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register" | "recover">("login"),
    [busy, setBusy] = useState(false);
  const { message, notify: setMessage } = useNotice(reset ? "reset" : mode);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    const f = new FormData(e.currentTarget);
    try {
      const client = browserClient(),
        email = String(f.get("email") || ""),
        password = String(f.get("password") || "");
      if (reset) {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        router.replace("/dashboard");
        router.refresh();
      } else if (mode === "login") {
        const { error } = await client.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.replace("/dashboard");
        router.refresh();
      } else if (mode === "register") {
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + "/auth/callback",
          },
        });
        if (error) throw error;
        // Con confirmación por correo, Supabase no da error si el correo ya existe: devuelve un usuario sin identidades.
        if (data.user && data.user.identities?.length === 0) {
          setMessage("Este correo ya está registrado. Inicia sesión o recupera tu contraseña.");
          return;
        }
        setMessage(
          "¡Registro exitoso! Verifica tu correo electrónico para validar tu cuenta (revisa también la carpeta de spam).",
        );
      } else {
        const { error } = await client.auth.resetPasswordForEmail(email, {
          redirectTo:
            window.location.origin + "/auth/callback?next=/reset-password",
        });
        if (error) throw error;
        setMessage(
          "Si existe una cuenta con ese correo, recibirás las instrucciones de recuperación.",
        );
      }
    } catch {
      setMessage(
        "No pudimos completar la solicitud. Revisa tus datos y la conexión o inténtalo más tarde.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <a className="brand" href="/">
          <img
            className="brand-icon"
            src="/icons/icon-192.png"
            width="40"
            height="40"
            alt=""
          />
          De<span>1</span>na
        </a>
        <div>
          <span className="eyebrow">HECHO PARA MOVERTE</span>
          <h1>
            Tu día no para.
            <br />
            Tú tampoco.
          </h1>
          <p>
            Del trabajo a casa. Del centro a donde quieras.
            <br />
            Muévete por Mara, sin tantas vueltas.
          </p>
          <div className="slogan">
            ¿Vamos? <span>¡De una! ↗</span>
          </div>
        </div>
        <small>Mara, Zulia · Viajes en moto</small>
      </section>
      <section className="auth-form">
        <span className="pill">DE1NA · ACCESO</span>
        <h2>
          {reset
            ? "Elige tu nueva contraseña"
            : mode === "register"
              ? "Tu próximo viaje empieza aquí"
              : mode === "recover"
                ? "Recupera tu acceso"
                : "Qué bueno verte por aquí"}
        </h2>
        <p className="muted">Tu cuenta para moverte sin complicarte.</p>
        {!configured ? (
          <div className="notice" role="status">
            Estamos preparando la conexión del servicio. El acceso aún no está
            habilitado.
          </div>
        ) : (
          <form onSubmit={submit}>
            {!reset && (
              <label>
                Correo electrónico
                <input
                  name="email"
                  type="email"
                  required
                  maxLength={120}
                  autoComplete="email"
                />
              </label>
            )}
            {(reset || mode !== "recover") && (
              <label>
                Contraseña
                <input
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  maxLength={128}
                  autoComplete={
                    reset || mode === "register"
                      ? "new-password"
                      : "current-password"
                  }
                />
              </label>
            )}
            <div className="auth-actions">
            <button className="primary" disabled={busy}>
              {busy
                ? "Procesando…"
                : reset
                  ? "Guardar contraseña"
                  : mode === "register"
                    ? "Crear cuenta"
                    : mode === "recover"
                      ? "Enviar instrucciones"
                      : "Iniciar sesión"}{" "}
              ↗
            </button>
            {!reset && mode === "login" && <PasskeyLogin disabled={busy} onBusyChange={setBusy} />}
            </div>
          </form>
        )}
        <Toast message={message} />
        {!reset && (
          <>
            <button
              className="text"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setMessage("");
              }}
            >
              {mode === "login"
                ? "¿Primera vez? Crea tu cuenta"
                : "Volver a iniciar sesión"}
            </button>
            <button
              className="text"
              onClick={() => {
                setMode("recover");
                setMessage("");
              }}
            >
              Olvidé mi contraseña
            </button>
          </>
        )}
      </section>
    </div>
  );
}
