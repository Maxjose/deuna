"use client";
import { useMemo, useRef, useState } from "react";
import { browserClient } from "@/lib/supabase/client";
import { closeOnBackdrop } from "@/lib/dialog";
import { AppIcon } from "./app-icon";

const ERRORS: Record<string, string> = {
  "Correo inválido": "Escribe un correo válido.",
  "Contraseña inválida": "La contraseña debe tener entre 8 y 72 caracteres.",
  "Correo ya registrado": "Ya existe una cuenta con ese correo.",
  "Rol inválido": "Elige si es pasajero o conductor.",
};

/** Administración: crear cuentas manualmente (quedan con el correo confirmado y listas para iniciar sesión). */
export function AdminCreateUser({ defaultRole, onCreated }: { defaultRole: "passenger" | "driver"; onCreated: (message: string) => void }) {
  const client = useMemo(() => browserClient(), []);
  const sheet = useRef<HTMLDialogElement>(null), form = useRef<HTMLFormElement>(null);
  const [role, setRole] = useState(defaultRole), [saving, setSaving] = useState(false), [error, setError] = useState(""), [show, setShow] = useState(false);
  function open() { form.current?.reset(); setRole(defaultRole); setError(""); setShow(false); sheet.current?.showModal(); sheet.current?.focus({ preventScroll: true }); }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const password = String(f.get("password") || "");
    if (password.length < 8) { setError(ERRORS["Contraseña inválida"]); return; }
    setSaving(true); setError("");
    const { error } = await client.rpc("admin_create_user", {
      email: String(f.get("email") || ""), password, display_name: String(f.get("name") || ""), phone: String(f.get("phone") || ""),
      role, approved: role === "driver" ? f.has("approved") : true,
    });
    setSaving(false);
    if (error) { setError(ERRORS[error.message] || "No pudimos crear la cuenta. Inténtalo de nuevo."); return; }
    sheet.current?.close();
    onCreated(`Cuenta creada. Ya puede iniciar sesión con ${String(f.get("email"))}.`);
  }
  return <>
    <button type="button" className="primary admin-create-button" onClick={open}><AppIcon name="account" />Crear cuenta</button>
    <dialog ref={sheet} tabIndex={-1} className="action-sheet admin-create-sheet" aria-labelledby="create-user-title" onClick={closeOnBackdrop} onCancel={e => { if (saving) e.preventDefault(); }}>
      <div className="sheet-handle" />
      <h2 id="create-user-title">Crear cuenta</h2>
      <p className="muted">La cuenta queda con el correo confirmado. Comparte la contraseña inicial con la persona; podrá cambiarla en Cuenta → Seguridad.</p>
      <form ref={form} className="admin-create-form" onSubmit={submit}>
        <div className="service-tabs" role="radiogroup" aria-label="Tipo de cuenta">
          {([["passenger", "Pasajero"], ["driver", "Conductor"]] as const).map(([value, label]) =>
            <button key={value} type="button" role="radio" aria-checked={role === value} className={role === value ? "is-active" : ""} onClick={() => setRole(value)}>{label}</button>)}
        </div>
        <label>Nombre completo<input name="name" autoComplete="off" maxLength={80} required disabled={saving} /></label>
        <label>Correo<input name="email" type="email" autoComplete="off" maxLength={254} required disabled={saving} /></label>
        <label>Teléfono<input name="phone" type="tel" inputMode="tel" placeholder="0412 1234567" maxLength={30} disabled={saving} /></label>
        <label>Contraseña inicial
          <span className="password-field"><input name="password" type={show ? "text" : "password"} autoComplete="new-password" minLength={8} maxLength={72} required disabled={saving} />
            <button type="button" className="text" onClick={() => setShow(v => !v)}>{show ? "Ocultar" : "Mostrar"}</button></span>
        </label>
        {role === "driver" && <label className="check"><input name="approved" type="checkbox" defaultChecked disabled={saving} />Habilitar como conductor desde ya</label>}
        {error && <p className="payment-error" role="alert">{error}</p>}
        <button className="primary" disabled={saving}>{saving ? "Creando…" : "Crear cuenta"}</button>
        <button type="button" className="text" disabled={saving} onClick={() => sheet.current?.close()}>Cancelar</button>
      </form>
    </dialog>
  </>;
}
