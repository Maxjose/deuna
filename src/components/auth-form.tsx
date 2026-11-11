"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase/client";
import { sendRecoveryEmail } from "@/lib/supabase/recovery";
import { PasskeyLogin } from "./passkey-login";
import { Toast, useNotice } from "./toast";
import { authErrorMessage } from "@/lib/auth-error";
export function AuthForm({
  configured,
}: {
  configured: boolean;
}) {
  const router = useRouter();
  const [confirmationEmail, setConfirmationEmail] = useState('');
  const [mode, setMode] = useState<"login" | "register" | "recover">("login"),
    [busy, setBusy] = useState(false);
  const { message, notify: setMessage } = useNotice(mode);
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
      if (mode === "login") {
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
        setConfirmationEmail(email);
      } else {
        const { error } = await sendRecoveryEmail(email, window.location.origin);
        if (error) throw error;
        setMessage(
          "Si existe una cuenta con ese correo, recibirás las instrucciones de recuperación.",
        );
      }
    } catch (error) {
      setMessage(authErrorMessage(error));
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
          {mode === 'register' && confirmationEmail ? 'Confirma tu correo' : mode === "register"
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
        ) : mode === 'register' && confirmationEmail ? (
          <div className="notice" role="status">
            ¡Registro exitoso! Te enviamos un enlace a <strong>{confirmationEmail}</strong>. Ábrelo para confirmar tu cuenta y luego inicia sesión. Revisa también la carpeta de spam.
          </div>
        ) : (
          <form onSubmit={submit}>
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
            {mode !== "recover" && (
              <label>
                Contraseña
                <input
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  maxLength={128}
                  autoComplete={
                    mode === "register"
                      ? "new-password"
                      : "current-password"
                  }
                />
              </label>
            )}
            <div className="auth-actions">
            <button className="primary" disabled={busy} aria-busy={busy}>
              {busy
                ? <><span className="auth-submit-spinner" aria-hidden="true"/><span className="sr-only">{mode==='login'?'Iniciando sesión':'Procesando solicitud'}</span></>
                : <>{mode === "register"
                    ? "Crear cuenta"
                    : mode === "recover"
                      ? "Enviar instrucciones"
                      : "Iniciar sesión"}{" "}↗</>}
            </button>
            {mode === "login" && <PasskeyLogin disabled={busy} onBusyChange={setBusy} />}
            </div>
          </form>
        )}
        <Toast message={message} />
          <>
            <button
              className="text"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setConfirmationEmail('');
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
                setConfirmationEmail('');
                setMessage("");
              }}
            >
              Olvidé mi contraseña
            </button>
          </>
        <p className="legal-links">{mode === "register" ? "Al crear tu cuenta aceptas nuestra " : ""}<a href="/privacidad">Política de privacidad</a></p>
      </section>
    </div>
  );
}
