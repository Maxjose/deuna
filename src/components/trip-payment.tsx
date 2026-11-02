"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { browserClient } from "@/lib/supabase/client";
import { usd } from "@/lib/fare";
import { bs, bsAmount, cleanPhone, cleanReference, formatIdNumber, formatPhone, parseBs, paymentStatusLabel, rateValue, VE_BANKS, type PaymentSettings } from "@/lib/payments";
import { AppIcon } from "./app-icon";
import {loadPaymentPreferences} from '@/lib/payment-preferences';

export type PaymentTrip = {
  id: string;
  status: string;
  fare_cents: number | null;
  payment_method?: string | null;
  exchange_rate?: number | string | null;
  payment_reference?: string | null;
  payment_status?: string | null;
  payment_note?: string | null;
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


/** Pasajero: datos del pago móvil y envío de la referencia (con banco y teléfono de origen), o recordatorio de efectivo. */
export function PassengerPayment({ trip, settings, offline }: { trip: PaymentTrip; settings: PaymentSettings | null; offline: boolean }) {
  const client = useMemo(() => browserClient(), []);
  const expected = trip.fare_cents != null ? bsAmount(trip.fare_cents, trip.exchange_rate) : null;
  const [draft, setDraft] = useState(""), [bank, setBank] = useState(""), [phone, setPhone] = useState(""), [amount, setAmount] = useState("");
  const [editing, setEditing] = useState(false), [sending, setSending] = useState(false), [error, setError] = useState(""), [sent, setSent] = useState<{ reference: string; status: string } | null>(null);
  const [pasting,setPasting]=useState(false);
  const bankEdited=useRef(false),phoneEdited=useRef(false);
  const updateReference=(value:string)=>{setDraft(value.replace(/\D/g,'').slice(-6));setError('');};
  async function pasteReference(){
    setPasting(true);
    try{updateReference(await navigator.clipboard.readText());}
    catch{setError('No pudimos leer el portapapeles. Mantén pulsado el campo y elige Pegar.');}
    finally{setPasting(false);}
  }
  useEffect(() => {
    if(trip.payment_method!=='pago_movil')return;
    let active=true;
    void loadPaymentPreferences(client).then(saved=>{
      if(!active)return;
      if(!bankEdited.current)setBank(saved.bank);
      if(!phoneEdited.current)setPhone(formatPhone(saved.phone));
    }).catch(()=>{if(active)setError('No pudimos cargar tus datos guardados. Puedes completar el banco y el teléfono aquí.');});
    return()=>{active=false;};
  }, [client,trip.payment_method]);
  useEffect(() => { if (expected != null) setAmount(expected.toFixed(2).replace(".", ",")); }, [expected]);
  useEffect(() => { setSent(null); }, [trip.payment_reference, trip.payment_status]);
  if (trip.payment_method === "wallet") {
    if (trip.fare_cents == null || !["searching", "assigned", "arrived", "ongoing"].includes(trip.status)) return null;
    return (
      <div className="payment-panel is-cash">
        <AppIcon name="wallet" />
        <p><strong>Pagado con tu saldo</strong><span>Se descontaron {usd(trip.fare_cents)}. Si el viaje se cancela, vuelven a tu saldo.</span></p>
      </div>
    );
  }
  if (trip.payment_method !== "pago_movil") {
    if (trip.fare_cents == null || !["assigned", "arrived", "ongoing"].includes(trip.status)) return null;
    return (
      <div className="payment-panel is-cash">
        <AppIcon name="cash" />
        <p><strong>Pagas en efectivo</strong><span>Entrega {usd(trip.fare_cents)} al conductor al llegar.</span></p>
      </div>
    );
  }
  if (trip.status === "searching") {
    return (
      <div className="payment-panel">
        <AppIcon name="phone" />
        <p><strong>Pago móvil</strong><span>Cuando un conductor acepte, aquí verás los datos para transferir.</span></p>
      </div>
    );
  }
  if (!["assigned", "arrived", "ongoing", "finished"].includes(trip.status)) return null;
  const reference = sent?.reference ?? trip.payment_reference ?? null;
  const status = sent?.status ?? trip.payment_status ?? null;
  const state = paymentStatusLabel(status, !!reference);
  const canEdit = status !== "verified";
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = cleanReference(draft), origin = cleanPhone(phone), paid = parseBs(amount);
    if (!clean) { setError("Escribe los últimos seis dígitos de la referencia."); return; }
    if (!bank) { setError("Elige el banco desde el que hiciste el pago."); return; }
    if (!origin) { setError("Escribe el teléfono desde el que pagaste, por ejemplo 0412-1234567."); return; }
    if (paid == null) { setError("Escribe el monto que transferiste, por ejemplo 3.680,00."); return; }
    setSending(true); setError("");
    const { data, error } = await client.rpc("report_payment", { trip_id: trip.id, reference: clean, bank, phone: origin, amount_bs: paid });
    setSending(false);
    if (error) {
      const known: Record<string, string> = {
        "Referencia inválida": "Esa referencia no es válida. Revísala.",
        "El monto no coincide con el del viaje": `El monto no coincide con el del viaje${expected != null ? ` (${bs(expected)})` : ""}. Revísalo.`,
        "Esta referencia ya fue usada en otro viaje": "Esa referencia ya se usó para otro viaje.",
        "Teléfono inválido": "Revisa el teléfono desde el que pagaste.",
        "Este pago ya fue verificado": "Este pago ya fue verificado.",
      };
      setError(known[error.message] ?? "No pudimos enviar los datos del pago. Comprueba tu conexión.");
      return;
    }
    setSent({ reference: clean, status: (data as { status?: string } | null)?.status ?? "checking" }); setEditing(false); setDraft("");
  }
  return (
    <section className="payment-panel is-pago-movil" aria-label="Pago móvil">
      <div className="payment-head">
        <span><small>PAGO MÓVIL</small><strong>{reference && !editing ? state.label : "Transfiere este monto"}</strong></span>
        <Amount trip={trip} />
      </div>
      {reference && !editing ? (
        <div className={"payment-reported is-" + state.tone} role="status">
          <AppIcon name={state.tone === "ok" ? "check" : state.tone === "bad" ? "close" : "history"} />
          <span>
            Referencia <strong>{reference}</strong>
            <small>{state.tone === "ok" ? "Tu pago fue confirmado con el banco." : state.tone === "waiting" ? "Estamos confirmando tu pago con el banco. Puede tardar unos minutos." : state.tone === "bad" ? (trip.payment_note || "La administración rechazó este pago. Corrige los datos o contacta soporte.") : "No pudimos confirmarlo automáticamente. La administración lo revisará."}</small>
          </span>
          {canEdit && <button type="button" className="text" onClick={() => { setEditing(true); setDraft(reference); }}>Corregir</button>}
        </div>
      ) : (
        <>
          {settings?.pago_movil_bank && settings.pago_movil_phone && settings.pago_movil_id ? (
            <div className="payment-data">
              <CopyRow label="Banco" value={settings.pago_movil_bank} />
              <CopyRow label="Teléfono" value={settings.pago_movil_phone} display={formatPhone(settings.pago_movil_phone)} />
              <CopyRow label="Cédula / RIF" value={settings.pago_movil_id} display={formatIdNumber(settings.pago_movil_id)} />
              {expected != null && <CopyRow label="Monto" value={expected.toFixed(2).replace(".", ",")} display={bs(expected)} />}
            </div>
          ) : (
            <p className="muted">Los datos de pago móvil no están disponibles en este momento. Consulta con soporte.</p>
          )}
          <form className="payment-reference" onSubmit={submit}>
            <p className="payment-form-title">Cuando hayas transferido, completa estos datos:</p>
            <label>
              Banco desde el que pagaste
              <select value={bank} onChange={(e) => {bankEdited.current=true;setBank(e.target.value);}} required>
                <option value="">Elige tu banco</option>
                {VE_BANKS.map(([code, name]) => <option key={code} value={code}>{name} ({code})</option>)}
              </select>
            </label>
            <div className="two">
              <label>
                Teléfono desde el que pagaste
                <input inputMode="tel" autoComplete="tel" placeholder="0412-1234567" maxLength={14} value={phone} onChange={(e) => {phoneEdited.current=true;setPhone(e.target.value);}} />
              </label>
              <label>
                Monto transferido (Bs)
                <input inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </label>
            </div>
            <label>
              Número de referencia
              <span className="payment-reference-field">
                <input inputMode="numeric" autoComplete="off" placeholder="Últimos 6 dígitos" value={draft} disabled={pasting||sending} onChange={e=>updateReference(e.target.value)} onPaste={e=>{e.preventDefault();updateReference(e.clipboardData.getData('text'));}}/>
                <button type="button" disabled={pasting||sending} onClick={()=>void pasteReference()}>{pasting?'…':'Pegar'}</button>
              </span>
            </label>
            {error && <p className="payment-error" role="alert">{error}</p>}
            <button className="primary" disabled={sending || pasting || offline || !cleanReference(draft)}>{sending ? "Enviando…" : "Enviar pago para verificar"}</button>
            {editing && <button type="button" className="text" onClick={() => { setEditing(false); setError(""); }}>Cancelar</button>}
          </form>
        </>
      )}
    </section>
  );
}

/** Conductor y administración: cómo se cobra este viaje. */
export function TripPaymentNote({ trip, viewer }: { trip: PaymentTrip; viewer: "driver" | "admin" }) {
  if (trip.fare_cents == null) return null;
  if (trip.payment_method === "wallet") {
    return (
      <p className="payment-note is-pago-movil">
        <AppIcon name="wallet" />
        <span><strong>Pagado con saldo{viewer === "driver" ? " · no cobres en efectivo" : ""}</strong><small>{usd(trip.fare_cents)} ya pagados por el pasajero</small></span>
      </p>
    );
  }
  if (trip.payment_method === "pago_movil") {
    return (
      <p className="payment-note is-pago-movil">
        <AppIcon name="phone" />
        <span>
          <strong>Pago móvil{viewer === "driver" ? " · no cobres en efectivo" : ""}</strong>
          <small>{trip.payment_reference ? `${paymentStatusLabel(trip.payment_status, true).label} · Ref. ${trip.payment_reference}` : "Referencia pendiente del pasajero"}</small>
        </span>
      </p>
    );
  }
  return (
    <p className="payment-note">
      <AppIcon name="cash" />
      <span><strong>{viewer === "driver" ? `Cobra ${usd(trip.fare_cents)} en efectivo` : "Efectivo al conductor"}</strong></span>
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
      <p className="muted">Los pasajeros que elijan pago móvil verán estos datos cuando un conductor acepte su viaje. Si dejas algún campo vacío, el pago móvil no estará disponible.</p>
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
