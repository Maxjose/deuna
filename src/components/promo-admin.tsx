"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { browserClient } from "@/lib/supabase/client";

type Promo = { id: string; title: string; image_url: string; link_url: string | null; audience: "all" | "passenger" | "driver"; active: boolean; published_at: string | null; created_at: string; views: number };
const AUDIENCE = { all: "Todos", passenger: "Pasajeros", driver: "Conductores" } as const;
const date = (v: string) => new Date(v).toLocaleString("es-VE", { dateStyle: "medium", timeStyle: "short" });

/** Administración: crear, publicar y retirar promociones emergentes con imagen y enlace. */
export function PromoAdmin() {
  const client = useMemo(() => browserClient(), []);
  const [items, setItems] = useState<Promo[] | null>(null), [editing, setEditing] = useState<Promo | null>(null);
  const [title, setTitle] = useState(""), [link, setLink] = useState(""), [audience, setAudience] = useState<Promo["audience"]>("all");
  const [file, setFile] = useState<File | null>(null), [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(""), [err, setErr] = useState(""), [msg, setMsg] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => { const { data, error } = await client.rpc("admin_promos"); if (!error) setItems(data as Promo[]); }, [client]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!file) return; const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
  function reset(p: Promo | null = null) { setEditing(p); setTitle(p?.title ?? ""); setLink(p?.link_url ?? ""); setAudience(p?.audience ?? "all"); setFile(null); setPreview(p?.image_url ?? ""); setErr(""); if (input.current) input.current.value = ""; }
  async function save(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setMsg("");
    if (!file && !editing) { setErr("Elige la imagen de la promoción."); return; }
    if (file && file.size > 5 * 1024 * 1024) { setErr("La imagen debe pesar menos de 5 MB."); return; }
    setBusy("save");
    try {
      let image = editing?.image_url ?? "";
      if (file) {
        const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
        const path = `${crypto.randomUUID()}.${ext}`;
        const up = await client.storage.from("promos").upload(path, file, { contentType: file.type, cacheControl: "31536000" });
        if (up.error) throw new Error("No se pudo subir la imagen (usa JPG, PNG o WebP).");
        image = client.storage.from("promos").getPublicUrl(path).data.publicUrl;
      }
      const { error } = await client.rpc("admin_promo_save", { payload: { id: editing?.id ?? null, title, image_url: image, link_url: link.trim() || null, audience } });
      if (error) throw new Error(error.message === "Enlace inválido" ? "El enlace debe empezar por https://" : "No se pudo guardar la promoción.");
      setMsg(editing ? "Promoción actualizada." : "Promoción creada. Publícala para que la vean los usuarios.");
      reset(); void load();
    } catch (error) { setErr(error instanceof Error ? error.message : "No se pudo guardar."); }
    finally { setBusy(""); }
  }
  async function publish(p: Promo, on: boolean) {
    setBusy(p.id); setErr(""); setMsg("");
    const { error } = await client.rpc("admin_promo_publish", { promo_id: p.id, publish: on });
    setBusy(""); if (error) setErr("No se pudo actualizar."); else { setMsg(on ? "Promoción publicada: la verán una vez al entrar a Inicio." : "Promoción retirada."); void load(); }
  }
  async function remove(p: Promo) {
    setBusy(p.id); setErr("");
    const { error } = await client.rpc("admin_promo_delete", { promo_id: p.id });
    setBusy(""); if (error) setErr("No se pudo eliminar."); else { if (editing?.id === p.id) reset(); void load(); }
  }
  return <div className="settings-grid promo-admin">
    <form className="trip-card" onSubmit={save}>
      <h2>{editing ? "Editar promoción" : "Nueva promoción"}</h2>
      <p className="muted">Aparece como ventana emergente en Inicio, una sola vez por usuario. Si vuelves a publicarla, se muestra de nuevo.</p>
      <label>Nombre (solo para ti)<input value={title} onChange={e => setTitle(e.target.value)} required minLength={2} maxLength={80} placeholder="Ej. 2x1 en Pizzería Mara" /></label>
      <label>Imagen<input ref={input} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setFile(e.target.files?.[0] ?? null)} /></label>
      {preview && <img className="promo-admin-preview" src={preview} alt="Vista previa" />}
      <p className="muted">Recomendado: vertical 4:5 (1080 × 1350 px), menos de 5 MB.</p>
      <label>Enlace al tocar la imagen (opcional)<input type="url" value={link} onChange={e => setLink(e.target.value)} placeholder="https://…" maxLength={500} /></label>
      <label>Mostrar a<select value={audience} onChange={e => setAudience(e.target.value as Promo["audience"])}>{Object.entries(AUDIENCE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      {err && <p className="payment-error" role="alert">{err}</p>}
      {msg && <p className="admin-create-notice" role="status">{msg}</p>}
      <button className="primary" disabled={!!busy}>{busy === "save" ? "Guardando…" : editing ? "Guardar cambios" : "Crear promoción"}</button>
      {editing && <button type="button" className="secondary" onClick={() => reset()}>Cancelar edición</button>}
    </form>
    <article className="trip-card">
      <h2>Promociones</h2>
      {!items ? <div className="skeleton" /> : items.length === 0 ? <p className="muted">Aún no hay promociones.</p> :
        <ul className="promo-admin-list">{items.map(p => <li key={p.id}>
          <img src={p.image_url} alt="" />
          <div>
            <strong>{p.title}</strong>
            <small>{AUDIENCE[p.audience]} · {p.active ? `Publicada ${p.published_at ? date(p.published_at) : ""} · vista por ${p.views}` : "Sin publicar"}</small>
            {p.link_url && <small className="promo-admin-link">{p.link_url}</small>}
            <span className="promo-admin-actions">
              <button type="button" className="primary" disabled={!!busy} onClick={() => void publish(p, true)}>{p.active ? "Volver a publicar" : "Publicar"}</button>
              {p.active && <button type="button" className="secondary" disabled={!!busy} onClick={() => void publish(p, false)}>Retirar</button>}
              <button type="button" className="secondary" disabled={!!busy} onClick={() => reset(p)}>Editar</button>
              <button type="button" className="secondary" disabled={!!busy} onClick={() => void remove(p)}>Eliminar</button>
            </span>
          </div>
        </li>)}</ul>}
    </article>
  </div>;
}
