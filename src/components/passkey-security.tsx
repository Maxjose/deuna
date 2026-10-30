"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { browserClient } from "@/lib/supabase/client";
import { usePasskeys } from "@/lib/use-passkeys";
type Credential = { id: string; friendly_name?: string; created_at: string };
export function PasskeySecurity() {
  const client = useMemo(() => browserClient(), []),
    { state, retry } = usePasskeys();
  const [keys, setKeys] = useState<Credential[]>([]),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [message, setMessage] = useState(""),
    [remove, setRemove] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null),
    controller = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await client.auth.passkey.list();
      if (error) throw error;
      setKeys(data || []);
    } catch {
      setMessage("No se pudieron consultar tus passkeys. Vuelve a intentarlo.");
    } finally {
      setLoading(false);
    }
  }, [client]);
  useEffect(() => {
    if (state === "enabled") void load();
  }, [state, load]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (remove) dialog.current?.showModal();
  }, [remove]);
  async function register() {
    setBusy(true);
    setMessage("");
    controller.current = new AbortController();
    try {
      const { error } = await client.auth.registerPasskey({
        options: { signal: controller.current.signal },
      });
      if (error) throw error;
      await load();
      setMessage("Passkey creada. Ya puedes usarla para entrar a De1na.");
    } catch {
      setMessage(
        "No se creó la passkey. Confirma que tu correo esté verificado y vuelve a intentarlo cuando el dispositivo lo permita.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function revoke() {
    if (!remove) return;
    const id = remove;
    dialog.current?.close();
    setBusy(true);
    setMessage("");
    try {
      const { error } = await client.auth.passkey.delete({ passkeyId: id });
      if (error) throw error;
      setKeys((k) => k.filter((v) => v.id !== id));
      setMessage(
        "Passkey revocada en De1na. Si sigue en tu gestor de contraseñas, puedes eliminarla también allí.",
      );
    } catch {
      setMessage("No se pudo revocar la passkey. Vuelve a intentarlo.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="trip-card security-card">
      <h2>Seguridad y acceso rápido</h2>
      <p className="muted">
        Entra con Face ID, huella o el PIN de tu dispositivo. Tu biometría
        permanece en el teléfono. Siempre podrás usar tu contraseña.
      </p>
      {state === "loading" ? (
        <p role="status">Comprobando disponibilidad…</p>
      ) : state === "unsupported" ? (
        <p className="muted">
          Este navegador no ofrece passkeys. Prueba con Safari o Chrome
          actualizado en un dispositivo compatible.
        </p>
      ) : state === "disabled" ? (
        <>
          <p className="muted">
            El acceso rápido todavía no está habilitado para De1na.
          </p>
          <button className="secondary" onClick={retry}>
            Comprobar disponibilidad
          </button>
        </>
      ) : state === "error" ? (
        <>
          <p role="status">No pudimos comprobar la conexión.</p>
          <button className="secondary" onClick={retry}>
            Reintentar
          </button>
        </>
      ) : (
        <>
          <button
            className="primary"
            disabled={busy}
            onClick={() => void register()}
          >
            {busy ? "Procesando…" : "Activar acceso rápido"}
          </button>
          {loading ? (
            <p role="status">Consultando passkeys…</p>
          ) : keys.length === 0 ? (
            <p className="muted">Aún no has registrado una passkey.</p>
          ) : (
            <ul className="passkey-list">
              {keys.map((k) => (
                <li key={k.id}>
                  <div>
                    <strong>{k.friendly_name || "Passkey personal"}</strong>
                    <small>
                      Creada el{" "}
                      {new Date(k.created_at).toLocaleDateString("es-VE")}
                    </small>
                  </div>
                  <button
                    className="text danger"
                    disabled={busy}
                    onClick={() => setRemove(k.id)}
                  >
                    Revocar
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            className="text"
            disabled={busy || loading}
            onClick={() => void load()}
          >
            Actualizar lista
          </button>
        </>
      )}
      {message && <p role="status">{message}</p>}
      <dialog
        ref={dialog}
        className="action-sheet"
        aria-label="Revocar passkey"
        onClose={() => setRemove(null)}
      >
        <div className="sheet-handle" />
        <h2>¿Revocar esta passkey?</h2>
        <p className="muted">
          Ya no servirá para entrar a De1na. Conservas el acceso con contraseña
          y tus otras passkeys.
        </p>
        <button className="primary" onClick={() => dialog.current?.close()}>
          Conservar passkey
        </button>
        <button className="secondary danger" onClick={() => void revoke()}>
          Revocar acceso
        </button>
      </dialog>
    </article>
  );
}
