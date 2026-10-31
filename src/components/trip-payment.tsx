"use client";
import { useEffect, useMemo, useState } from "react";
import { browserClient } from "@/lib/supabase/client";
import { usd } from "@/lib/fare";
import { bs, bsAmount, cleanReference, formatIdNumber, formatPhone, rateValue, type PaymentSettings } from "@/lib/payments";
import { AppIcon } from "./app-icon";

export type PaymentTrip = {
  id: string;
  status: string;
  fare_cents: number | null;
  payment_method?: string | null;
  exchange_rate?: number | string | null;
  payment_reference?: string | null;
};

function Amount({ trip }: { trip: PaymentTrip }) {
  if (trip.fare_cents == null) return null;
  const amount = bsAmount(trip.fare_cents, trip.exchange_rate);
  return (
    <span className="payment-amount">
      <strong>{usd(trip.fare_cents)}</strong>
      {amount != null && <small>{bs(amount)} · tasa {rateValue(trip.exchange_rate)?.toLocaleString("es-VE")} Bs/USD</small>}
    </span>
  );
}

function CopyRow({ label, value, display }: { label: string; value: string; display?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false), 1800); return () => clearTimeout(timer); }, [copied]);
  return (
    <div className="payment-data-row">
      <span><small>{label}</small><strong>{display ?? value}</strong></span>
      <button type="button" className="payment-copy" aria-label={`Copiar ${label.toLowerCase()}`}
        onClick={() => { void navigator.clipboard?.writeText(value).then(() => setCopied(true)).catch(() => {}); }}>
        {copied ? "Copiado" : <AppIcon name="copy" />}
      </button>
    </div>
  );
}

/** Pasajero: datos del pago móvil y envío de la referencia, o recordatorio de efectivo. */
export function PassengerPayment({ trip, settings, offline }: { trip: PaymentTrip; settings: PaymentSettings | null; offline: boolean }) {
  const client = useMemo(() => browserClient(), []);
  const [draft, setDraft] = useState(""), [editing, setEditing] = useState(false), [sending, setSending] = useState(false), [error, setError] = useState(""), [sent, setSent] = useState<string | null>(null);
  const reference = sent ?? trip.payment_reference ?? null;
  useEffect(() => { setSent(null); }, [trip.payment_reference]);
  if (trip.payment_method !== "pago_movil") {
    if (trip.fare_cents == null || !["assigned", "arrived", "ongoing"].includes(trip.status)) return null;
    return (
      <div className="payment-panel is-cash">
        <AppIcon name="cash" />
        <p><strong>Pagas en efectivo</strong><span>Entrega {usd(trip.fare_cents)} al motorizado al llegar.</span></p>
      </div>
    );
  }
  if (trip.status === "searching") {
    return (
      <div className="payment-panel">
        <AppIcon name="phone" />
        <p><strong>Pago móvil</strong><span>Cuando un motorizado acepte, aquí verás los datos para transferir.</span></p>
      </div>
    );
  }
  if (!["assigned", "arrived", "ongoing", "finished"].includes(trip.status)) return null;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = cleanReference(draft);
    if (!clean) { setError("Escribe el número de referencia (solo números, entre 4 y 20 dígitos)."); return; }
    setSending(true); setError("");
    const { error } = await client.rpc("report_payment", { trip_id: trip.id, reference: clean });
    setSending(false);
    if (error) { setError(error.message === "Referencia inválida" ? "Esa referencia no es válida. Revísala." : "No pudimos enviar la referencia. Comprueba tu conexión."); return; }
    setSent(clean); setEditing(false); setDraft("");
  }
  return (
    <section className="payment-panel is-pago-movil" aria-label="Pago móvil">
      <div className="payment-head">
        <span><small>PAGO MÓVIL</small><strong>{reference && !editing ? "Referencia enviada" : "Transfiere este monto"}</strong></span>
        <Amount trip={trip} />
      </div>
      {reference && !editing ? (
        <div className="payment-reported" role="status">
          <AppIcon name="check" />
          <span>Referencia <strong>{reference}</strong></span>
          <button type="button" className="text" onClick={() => { setEditing(true); setDraft(reference); }}>Corregir</button>
        </div>
      ) : (
        <>
          {settings?.pago_movil_bank && settings.pago_movil_phone && settings.pago_movil_id ? (
            <div className="payment-data">
              <CopyRow label="Banco" value={settings.pago_movil_bank} />
              <CopyRow label="Teléfono" value={settings.pago_movil_phone} display={formatPhone(settings.pago_movil_phone)} />
              <CopyRow label="Cédula / RIF" value={settings.pago_movil_id} display={formatIdNumber(settings.pago_movil_id)} />
              {trip.fare_cents != null && bsAmount(trip.fare_cents, trip.exchange_rate) != null && (
                <CopyRow label="Monto" value={(bsAmount(trip.fare_cents, trip.exchange_rate) ?? 0).toFixed(2).replace(".", ",")} display={bs(bsAmount(trip.fare_cents, trip.exchange_rate) ?? 0)} />
              )}
            </div>
          ) : (
            <p className="muted">Los datos de pago móvil no están disponibles en este momento. Consulta con soporte.</p>
          )}
          <form className="payment-reference" onSubmit={submit}>
            <label>
              Número de referencia
              <input inputMode="numeric" autoComplete="off" placeholder="Ej. 00123456" maxLength={30} value={draft} onChange={(e) => setDraft(e.target.value)} />
            </label>
            {error && <p className="payment-error" role="alert">{error}</p>}
            <button className="primary" disabled={sending || offline || !draft.trim()}>{sending ? "Enviando…" : "Enviar referencia"}</button>
            {editing && <button type="button" className="text" onClick={() => { setEditing(false); setError(""); }}>Cancelar</button>}
          </form>
        </>
      )}
    </section>
  );
}

/** Motorizado y administración: cómo se cobra este viaje. */
export function TripPaymentNote({ trip, viewer }: { trip: PaymentTrip; viewer: "driver" | "admin" }) {
  if (trip.fare_cents == null) return null;
  if (trip.payment_method === "pago_movil") {
    return (
      <p className="payment-note is-pago-movil">
        <AppIcon name="phone" />
        <span>
          <strong>Pago móvil{viewer === "driver" ? " · no cobres en efectivo" : ""}</strong>
          <small>{trip.payment_reference ? `Referencia ${trip.payment_reference}` : "Referencia pendiente del pasajero"}</small>
        </span>
      </p>
    );
  }
  return (
    <p className="payment-note">
      <AppIcon name="cash" />
      <span><strong>{viewer === "driver" ? `Cobra ${usd(trip.fare_cents)} en efectivo` : "Efectivo al motorizado"}</strong></span>
    </p>
  );
}

/** Administración: datos de pago móvil y tasa del día. */
export function PaymentSettingsForm({ settings, busy, onSaved }: { settings: PaymentSettings; busy: boolean; onSaved: (message: string) => void }) {
  const client = useMemo(() => browserClient(), []);
  const [saving, setSaving] = useState(false), [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (name: string) => String(f.get(name) || "").trim();
    const rawRate = text("rate").replace(/\./g, "").replace(",", ".");
    const rate = rawRate ? Number(rawRate) : null;
    if (rate != null && (!Number.isFinite(rate) || rate <= 0)) { setError("Escribe una tasa válida, por ejemplo 40,50."); return; }
    const phone = text("phone").replace(/\D/g, ""), id = text("id").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
    if (phone && !/^\d{11}$/.test(phone)) { setError("El teléfono debe tener 11 dígitos, por ejemplo 0414-1234567."); return; }
    if (id && !/^[VEJGP]\d{5,10}$/.test(id)) { setError("La cédula o RIF debe empezar por V, E, J, G o P, seguida de números."); return; }
    setSaving(true); setError("");
    const { error } = await client.rpc("save_payment_settings", { bank: text("bank"), phone, id_number: id, rate });
    setSaving(false);
    if (error) { setError("No pudimos guardar los datos de pago. Revísalos e inténtalo de nuevo."); return; }
    onSaved("Datos de pago guardados.");
  }
  const rate = rateValue(settings.exchange_rate);
  return (
    <form className="trip-card payment-settings" onSubmit={submit}>
      <h2>Pago móvil y tasa</h2>
      <p className="muted">Los pasajeros que elijan pago móvil verán estos datos cuando un motorizado acepte su viaje. Si dejas algún campo vacío, el pago móvil no estará disponible.</p>
      <label>Banco<input name="bank" defaultValue={settings.pago_movil_bank ?? ""} maxLength={80} placeholder="Ej. Banco de Venezuela (0102)" /></label>
      <div className="two">
        <label>Teléfono<input name="phone" inputMode="tel" defaultValue={settings.pago_movil_phone ? formatPhone(settings.pago_movil_phone) : ""} placeholder="0414-1234567" /></label>
        <label>Cédula o RIF<input name="id" defaultValue={settings.pago_movil_id ? formatIdNumber(settings.pago_movil_id) : ""} placeholder="V-12.345.678" /></label>
      </div>
      <label>Tasa del día (Bs por USD)<input name="rate" inputMode="decimal" defaultValue={rate != null ? rate.toLocaleString("es-VE", { maximumFractionDigits: 4 }) : ""} placeholder="Ej. 40,50" /></label>
      {settings.exchange_rate_updated_at && <p className="muted">Tasa actualizada el {new Date(settings.exchange_rate_updated_at).toLocaleString("es-VE", { dateStyle: "medium", timeStyle: "short" })}</p>}
      {error && <p className="payment-error" role="alert">{error}</p>}
      <button className="primary" disabled={busy || saving}>{saving ? "Guardando…" : "Guardar datos de pago"}</button>
    </form>
  );
}
