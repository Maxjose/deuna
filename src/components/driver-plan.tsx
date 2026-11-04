"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { browserClient } from "@/lib/supabase/client";
import { usd } from "@/lib/fare";
import { VE_BANKS, bankName, bs, cleanPhone, formatPhone } from "@/lib/payments";
import { nativeDeviceId, readClipboardText } from "@/lib/native";
import { AppIcon } from "./app-icon";
import { CopyRow } from "./trip-payment";
import { TxField, verifyBinance } from "./binance-payment";

export type PlanState = {
  mode: string; status: "not_applicable" | "none" | "active" | "expiring" | "grace" | "expired"; paid_until: string | null; grace_until: string | null;
  trial_used: boolean; trial_enabled: boolean; trial_days: number; week_cents: number; month_cents: number; auto: boolean; whatsapp: string;
  exchange_rate: number | string | null; pago_movil: { bank: string | null; phone: string | null; id: string | null };
  binance: { pay_id: string | null; link: string | null } | null;
  payments: { id: string; plan: string; days: number; amount_cents: number; method: string; status: string; reference: string | null; binance_tx: string | null; note: string | null; created_at: string }[];
};
const date = (v: string) => new Date(v).toLocaleString("es-VE", { dateStyle: "medium", timeStyle: "short" });
const PLAN: Record<string, string> = { week: "Plan semanal", month: "Plan mensual", trial: "Prueba gratis", gift: "Días de regalo" };
const METHOD: Record<string, string> = { pago_movil: "Pago móvil", binance: "Binance Pay", admin: "Administración", trial: "De1na" };
const STATUS: Record<string, string> = { checking: "Verificando", review: "En revisión", approved: "Aprobado", rejected: "Rechazado" };
const ERRORS: Record<string, string> = {
  "Referencia inválida": "Escribe los últimos 6 dígitos de la referencia.", "Banco inválido": "Selecciona el banco de origen.",
  "Teléfono inválido": "Escribe el teléfono de origen, por ejemplo 0412 1234567.", "Esta referencia ya fue usada": "Esta referencia ya fue usada.",
  "Tienes un pago en revisión": "Ya tienes un pago en revisión. Espera a que se apruebe.", "Pago movil no disponible": "El pago móvil no está disponible por ahora.",
  "Activación manual": "Los planes se activan por WhatsApp.",
};

export function usePlan(enabled: boolean) {
  const client = useMemo(() => browserClient(), []);
  const [plan, setPlan] = useState<PlanState | null>(null);
  const reload = useCallback(async () => {
    if (!enabled) return;
    const { data, error } = await client.rpc("my_plan", { device: nativeDeviceId() });
    if (!error && data) setPlan(data as PlanState);
  }, [client, enabled]);
  useEffect(() => { void reload(); }, [reload]);
  return { plan, reload };
}

export function planHeadline(p: PlanState) {
  const until = p.paid_until ? new Date(p.paid_until).toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "long" }) : "";
  switch (p.status) {
    case "active": return { tone: "ok", title: `Activo hasta el ${until}`, text: "Puedes conectarte y recibir viajes." };
    case "expiring": return { tone: "warn", title: `Vence pronto: ${until}`, text: "Renueva tu plan para no quedarte sin viajes." };
    case "grace": return { tone: "warn", title: "Tu plan venció", text: `Tienes hasta ${p.grace_until ? date(p.grace_until) : "pronto"} para renovar antes de que se pause tu cuenta.` };
    case "expired": return { tone: "bad", title: "Plan vencido", text: "Renueva tu plan para volver a conectarte y recibir viajes." };
    case "none": return { tone: "bad", title: "Sin plan activo", text: p.trial_used || !p.trial_enabled ? "Elige un plan para empezar a recibir viajes." : "Registra «Mi moto» y «Mis cuentas» en Cuenta para activar tu prueba gratis." };
    default: return { tone: "ok", title: "", text: "" };
  }
}

/** Conductor (modo suscripción): estado del plan, renovación y pagos. Reemplaza «Ganancias». */
export function DriverPlan({ plan, onChanged, driverName, email }: { plan: PlanState | null; onChanged: () => void; driverName: string; email: string }) {
  const client = useMemo(() => browserClient(), []);
  const [choice, setChoice] = useState<"week" | "month">("week"), [via, setVia] = useState<"pago_movil" | "binance">("pago_movil");
  const [form, setForm] = useState({ bank: "", phone: "", reference: "" }), [tx, setTx] = useState("");
  const [busy, setBusy] = useState(false), [err, setErr] = useState(""), [ok, setOk] = useState("");
  if (!plan) return <div className="skeleton-group" role="status" aria-label="Cargando tu plan"><div className="skeleton" /><div className="skeleton" /></div>;
  const head = planHeadline(plan), cents = choice === "week" ? plan.week_cents : plan.month_cents;
  const rate = plan.exchange_rate != null ? Number(plan.exchange_rate) : null, amountBs = rate ? Math.round(cents * rate) / 100 : null;
  const pending = plan.payments.find(p => p.status === "checking" || p.status === "review");
  const pmReady = !!plan.pago_movil.bank && rate != null, bnReady = !!plan.binance?.pay_id;
  const methodVia = via === "binance" && bnReady ? "binance" : pmReady ? "pago_movil" : bnReady ? "binance" : null;
  const wa = `https://wa.me/58${plan.whatsapp.replace(/^0/, "")}?text=${encodeURIComponent(`Hola, soy ${driverName || "conductor"} (${email}). Quiero ${plan.status === "active" || plan.status === "expiring" ? "renovar" : "activar"} mi plan ${choice === "week" ? "semanal" : "mensual"} de De1na.`)}`;
  async function payPagoMovil(e: React.FormEvent) {
    e.preventDefault();
    const phone = cleanPhone(form.phone);
    if (!phone) { setErr(ERRORS["Teléfono inválido"]); return; }
    setBusy(true); setErr(""); setOk("");
    const { data, error } = await client.rpc("request_plan_payment", { plan: choice, reference: form.reference, bank: form.bank, phone });
    setBusy(false);
    if (error) { setErr(ERRORS[error.message] || "No pudimos registrar el pago. Inténtalo de nuevo."); return; }
    setOk((data as { status: string }).status === "checking" ? "Recibimos tu pago. Lo estamos verificando con el banco; tu plan se activará en unos minutos." : "Recibimos tu pago. La administración lo revisará pronto.");
    setForm({ bank: form.bank, phone: form.phone, reference: "" }); onChanged();
  }
  async function payBinance(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(""); setOk("");
    try { await verifyBinance({ kind: "subscription", plan: choice, transaction_id: tx }); setOk("¡Pago verificado! Tu plan ya está activo."); setTx(""); onChanged(); }
    catch (error) { setErr(error instanceof Error ? error.message : "No pudimos verificar el pago."); }
    finally { setBusy(false); }
  }
  return <div className="account-stack driver-plan">
    <article className={"trip-card plan-status is-" + head.tone}>
      <span className="wallet-eyebrow">MI PLAN</span>
      <strong className="plan-title">{head.title}</strong>
      <p className="muted">{head.text}</p>
    </article>

    <article className="trip-card plan-buy">
      <h2>{plan.status === "active" || plan.status === "expiring" ? "Renovar plan" : "Elegir plan"}</h2>
      <div className="plan-options" role="radiogroup" aria-label="Plan">
        {([["week", "Semanal", plan.week_cents, "7 días"], ["month", "Mensual", plan.month_cents, "30 días"]] as const).map(([value, label, price, days]) =>
          <button key={value} type="button" role="radio" aria-checked={choice === value} className={choice === value ? "is-active" : ""} onClick={() => setChoice(value)}>
            <strong>{label}</strong><span>{usd(price)}</span><small>{days}{value === "month" && plan.week_cents * 4 > plan.month_cents ? ` · ahorras ${usd(plan.week_cents * 4 - plan.month_cents)}` : ""}</small>
          </button>)}
      </div>
      <p className="muted">Los días se suman a tu plan actual. Si ya venció, cuentan desde hoy.</p>

      {!plan.auto ? <>
        <p>Para activar o renovar tu plan escríbenos por WhatsApp y te indicamos cómo pagar.</p>
        <a className="primary plan-whatsapp" href={wa} target="_blank" rel="noopener"><AppIcon name="messages" />Contactar a De1na por WhatsApp</a>
      </> : pending ? <p className="cancel-limit" role="status">Tienes un pago {STATUS[pending.status].toLowerCase()} ({PLAN[pending.plan]}). Te avisaremos cuando se apruebe.</p> : <>
        {pmReady && bnReady && <div className="service-tabs" role="radiogroup" aria-label="Método de pago">
          <button type="button" role="radio" aria-checked={methodVia === "pago_movil"} className={methodVia === "pago_movil" ? "is-active" : ""} onClick={() => setVia("pago_movil")}>Pago móvil</button>
          <button type="button" role="radio" aria-checked={methodVia === "binance"} className={methodVia === "binance" ? "is-active" : ""} onClick={() => setVia("binance")}>Binance Pay</button>
        </div>}
        {methodVia === "pago_movil" && <form className="plan-pay" onSubmit={payPagoMovil}>
          <div className="payment-data">
            <CopyRow label="Banco" value={plan.pago_movil.bank!} display={`${bankName(plan.pago_movil.bank)} (${plan.pago_movil.bank})`} />
            {plan.pago_movil.phone && <CopyRow label="Teléfono" value={plan.pago_movil.phone} display={formatPhone(plan.pago_movil.phone)} />}
            {plan.pago_movil.id && <CopyRow label="Cédula / RIF" value={plan.pago_movil.id} />}
            {amountBs != null && <CopyRow label="Monto" value={amountBs.toFixed(2).replace(".", ",")} display={bs(amountBs)} />}
          </div>
          <label>Banco de origen<select value={form.bank} onChange={e => setForm({ ...form, bank: e.target.value })} required disabled={busy}><option value="">Selecciona tu banco</option>{VE_BANKS.map(([c, n]) => <option key={c} value={c}>{n} ({c})</option>)}</select></label>
          <label>Teléfono de origen<input type="tel" inputMode="tel" placeholder="0412 1234567" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required disabled={busy} /></label>
          <label>Referencia
            <span className="payment-reference-field">
              <input inputMode="numeric" placeholder="Últimos 6 dígitos" value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value.replace(/\D/g, "").slice(-6) })} required disabled={busy} />
              <button type="button" disabled={busy} onClick={async () => { try { setForm(f => ({ ...f, reference: "" })); const t = await readClipboardText(); setForm(f => ({ ...f, reference: t.replace(/\D/g, "").slice(-6) })); } catch { setErr("No pudimos leer el portapapeles."); } }}>Pegar</button>
            </span>
          </label>
          <button className="primary" disabled={busy}>{busy ? "Enviando…" : `Pagar ${usd(cents)} y activar`}</button>
        </form>}
        {methodVia === "binance" && <form className="plan-pay" onSubmit={payBinance}>
          <p>Envía <strong>{(cents / 100).toFixed(2)} USDT</strong> a De1na y pega el ID de la transacción.</p>
          {plan.binance?.link ? <a className="primary binance-open" href={plan.binance.link} target="_blank" rel="noopener"><AppIcon name="wallet" />Pagar en Binance</a>
            : <div className="payment-data"><CopyRow label="Pay ID de De1na" value={plan.binance!.pay_id!} /></div>}
          <TxField value={tx} onChange={setTx} disabled={busy} />
          <button className="primary" disabled={busy || tx.length < 6}>{busy ? "Verificando…" : "Verificar y activar"}</button>
        </form>}
        {!methodVia && <p className="muted">Los pagos no están disponibles por ahora. <a href={wa} target="_blank" rel="noopener">Escríbenos por WhatsApp</a>.</p>}
      </>}
      {err && <p className="payment-error" role="alert">{err}</p>}
      {ok && <p className="admin-create-notice" role="status">{ok}</p>}
    </article>

    <article className="trip-card">
      <h2>Historial</h2>
      {plan.payments.length === 0 ? <p className="muted">Aún no tienes pagos.</p> :
        <ul className="wallet-movements">{plan.payments.map(p => <li key={p.id}>
          <span><strong>{PLAN[p.plan]} · {p.days} días</strong><small>{METHOD[p.method]}{p.reference ? ` · Ref. ${p.reference}` : ""} · {date(p.created_at)}</small></span>
          <b className={p.status === "approved" ? "is-in" : p.status === "rejected" ? "is-out" : ""}>{p.amount_cents ? usd(p.amount_cents) : "Gratis"}{p.status !== "approved" ? ` · ${STATUS[p.status]}` : ""}</b>
        </li>)}</ul>}
    </article>
  </div>;
}
