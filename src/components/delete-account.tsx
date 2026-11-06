"use client";
import { useMemo, useState } from "react";
import { browserClient } from "@/lib/supabase/client";
import { disconnectPushDevice } from "@/lib/push-device";

const ERRORS: Record<string, string> = {
  "Tienes un viaje activo": "Termina o cancela tu viaje activo antes de eliminar la cuenta.",
  "Tienes un saldo pendiente": "Paga tu saldo pendiente antes de eliminar la cuenta.",
  "Tienes ganancias por cobrar": "Tienes ganancias por cobrar. Contacta a De1na para recibir tu pago antes de eliminar la cuenta.",
  "Las cuentas de administración no se eliminan desde aquí": "Las cuentas de administración no se pueden eliminar desde aquí.",
  "Confirmación inválida": "Escribe ELIMINAR para confirmar.",
};

/** Eliminar la cuenta (Google Play exige poder hacerlo desde la app y la web). */
export function DeleteAccount() {
  const client = useMemo(() => browserClient(), []);
  const [open, setOpen] = useState(false), [text, setText] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  if (!open) return <div className="trip-card delete-account">
    <h2>Eliminar cuenta</h2>
    <p className="muted">Borra tus datos personales y cierra tu acceso a De1na. Esta acción no se puede deshacer.</p>
    <button type="button" className="secondary danger" onClick={() => setOpen(true)}>Eliminar mi cuenta</button>
  </div>;
  return <form className="trip-card delete-account" onSubmit={async e => {
    e.preventDefault(); if (busy) return;
    setBusy(true); setErr("");
    const preparation = await client.rpc('prepare_document_deletion', { confirmation: text });
    if (preparation.error) { setBusy(false); setErr(ERRORS[preparation.error.message] || 'No pudimos preparar la eliminación. Inténtalo de nuevo.'); return; }
    const paths = preparation.data as string[];
    if (paths.length) {
      const removed = await client.storage.from('driver-documents').remove(paths);
      if (removed.error) { setBusy(false); setErr('No pudimos eliminar los archivos. Reintenta para completar la eliminación de tu cuenta.'); return; }
    }
    const { error } = await client.rpc("delete_my_account", { confirmation: text });
    if (error) { setBusy(false); setErr(ERRORS[error.message] || "No pudimos eliminar la cuenta. Inténtalo de nuevo."); return; }
    try { await disconnectPushDevice(); } catch { /* el dispositivo ya no está asociado */ }
    await client.auth.signOut().catch(() => {});
    window.location.replace("/login?deleted=1");
  }}>
    <h2>¿Eliminar tu cuenta?</h2>
    <p>Se borrarán tu nombre, correo, teléfono, passkeys, lugares favoritos y datos de pago guardados. Tu saldo De1na disponible se pierde. Si tienes viajes, el historial se conserva sin tus datos personales.</p>
    <label>Escribe <strong>ELIMINAR</strong> para confirmar<input value={text} onChange={e => setText(e.target.value)} autoComplete="off" autoCapitalize="characters" disabled={busy} /></label>
    {err && <p className="payment-error" role="alert">{err}</p>}
    <button className="secondary danger" disabled={busy || text.trim().toUpperCase() !== "ELIMINAR"}>{busy ? "Eliminando…" : "Eliminar definitivamente"}</button>
    <button type="button" className="text" disabled={busy} onClick={() => { setOpen(false); setText(""); setErr(""); }}>Cancelar</button>
  </form>;
}
