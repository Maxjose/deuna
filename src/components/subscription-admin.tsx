"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { browserClient } from "@/lib/supabase/client";
import { usd } from "@/lib/fare";
import { bankName, bs, formatPhone } from "@/lib/payments";
import type { PlanState } from "./driver-plan";

type Settings = { billing_mode?: string; sub_week_cents?: number; sub_month_cents?: number; sub_trial_enabled?: boolean; sub_trial_days?: number; sub_grace_hours?: number; sub_auto_activation?: boolean; sub_whatsapp?: string };
export type PlanOverview = {
  drivers: Record<string, { status: PlanState["status"]; paid_until: string | null; duplicate: boolean }>;
  pending: { id: string; driver_id: string; name: string; plan: string; days: number; amount_cents: number; amount_bs: number | null; method: string; reference: string | null; bank: string | null; phone: string | null; note: string | null; created_at: string }[];
  collected_30d_cents: number; payments_30d: number;
};
const date = (v: string) => new Date(v).toLocaleString("es-VE", { dateStyle: "medium", timeStyle: "short" });
export const PLAN_BADGE: Record<string, [string, string]> = {
  active: ["Plan activo", "ok"], expiring: ["Vence pronto", "warn"], grace: ["En gracia", "warn"], expired: ["Plan vencido", "bad"], none: ["Sin plan", "bad"],
};
const PLAN: Record<string, string> = { week: "Semanal", month: "Mensual", trial: "Prueba gratis", gift: "Regalo" };
const STATUS: Record<string, string> = { checking: "Verificando", review: "En revisión", approved: "Aprobado", rejected: "Rechazado" };

export function usePlanOverview(enabled: boolean, refresh?: unknown) {
  const client = useMemo(() => browserClient(), []);
  const [data, setData] = useState<PlanOverview | null>(null);
  const reload = useCallback(async () => {
    if (!enabled) { setData(null); return; }
    const { data, error } = await client.rpc("admin_plan_overview");
    if (!error) setData(data as PlanOverview);
  }, [client, enabled]);
  useEffect(() => { void reload(); }, [reload, refresh]);
  return { overview: data, reload };
}

/** Administración: modelo de cobro (comisión o suscripción) y reglas de los planes. */
export function SubscriptionSettings({ settings, busy, onSaved }: { settings: Settings; busy: boolean; onSaved: (text: string) => void }) {
  const client = useMemo(() => browserClient(), []);
  const [mode, setMode] = useState(settings.billing_mode === "subscription" ? "subscription" : "commission");
  const [trial, setTrial] = useState(settings.sub_trial_enabled !== false), [auto, setAuto] = useState(settings.sub_auto_activation !== false);
  const [saving, setSaving] = useState(false), [err, setErr] = useState("");
  return <form className="trip-card commission-settings" onSubmit={async e => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    const money = (k: string) => Math.round(Number(String(f.get(k)).replace(",", ".")) * 100);
    const payload = { billing_mode: mode, week_cents: money("week"), month_cents: money("month"), trial_enabled: trial, trial_days: Number(f.get("trial_days")),
      grace_hours: Number(f.get("grace")), auto_activation: auto, whatsapp: String(f.get("whatsapp")) };
    if (!(payload.week_cents > 0 && payload.month_cents > 0)) { setErr("Escribe precios mayores que cero."); return; }
    setSaving(true); setErr("");
    const { error } = await client.rpc("admin_subscription_settings", { payload });
    setSaving(false);
    if (error) setErr(error.message === "WhatsApp inválido" ? "Escribe el WhatsApp con 11 dígitos, por ejemplo 0412 6655273." : "No se pudo guardar. Revisa los valores.");
    else onSaved(mode === "subscription" ? "Modelo de suscripción guardado." : "Modelo de comisión guardado.");
  }}>
    <h2>Modelo de cobro</h2>
    <div className="service-tabs" role="radiogroup" aria-label="Modelo de cobro">
      <button type="button" role="radio" aria-checked={mode === "commission"} className={mode === "commission" ? "is-active" : ""} onClick={() => setMode("commission")} disabled={saving || busy}>Comisión</button>
      <button type="button" role="radio" aria-checked={mode === "subscription"} className={mode === "subscription" ? "is-active" : ""} onClick={() => setMode("subscription")} disabled={saving || busy}>Suscripción</button>
    </div>
    <p className="muted">{mode === "commission" ? "De1na cobra los viajes y se queda un porcentaje. Los conductores ven sus ganancias y cobros." : "Los conductores pagan un plan prepagado. Los pasajeros pagan directo al conductor en efectivo o pago móvil; Binance y saldo se ocultan."}</p>
    <fieldset className={"commission-fields" + (mode === "subscription" ? "" : " is-off")} disabled={saving || busy}>
      <legend className="sr-only">Planes</legend>
      <div className="settings-pair">
        <label>Plan semanal (USD)<input name="week" type="number" min="0.5" step="0.01" required defaultValue={(settings.sub_week_cents ?? 600) / 100} /></label>
        <label>Plan mensual (USD)<input name="month" type="number" min="0.5" step="0.01" required defaultValue={(settings.sub_month_cents ?? 2000) / 100} /></label>
      </div>
      <label className="payment-switch"><input type="checkbox" role="switch" checked={trial} onChange={e => setTrial(e.target.checked)} /><span><strong>Prueba gratis</strong><small>Una sola vez por cédula, placa y teléfono, al aprobar al conductor.</small></span></label>
      <div className="settings-pair">
        <label>Días de prueba<input name="trial_days" type="number" min="1" max="30" required defaultValue={settings.sub_trial_days ?? 7} disabled={!trial} /></label>
        <label>Gracia tras vencer (horas)<input name="grace" type="number" min="0" max="168" required defaultValue={settings.sub_grace_hours ?? 24} /></label>
      </div>
      <label className="payment-switch"><input type="checkbox" role="switch" checked={auto} onChange={e => setAuto(e.target.checked)} /><span><strong>{auto ? "Activación automática" : "Activación manual"}</strong><small>{auto ? "El conductor paga por pago móvil o Binance y su plan se activa al verificarse." : "No se muestran datos de pago: el conductor te escribe por WhatsApp y tú extiendes su plan."}</small></span></label>
      <label>WhatsApp para planes<input name="whatsapp" type="tel" inputMode="tel" required defaultValue={formatPhone(settings.sub_whatsapp ?? "04126655273")} /></label>
    </fieldset>
    {err && <p className="payment-error" role="alert">{err}</p>}
    <button className="primary" disabled={saving || busy}>{saving ? "Guardando…" : "Guardar modelo"}</button>
  </form>;
}

/** Administración: pagos de planes por revisar y recaudado en 30 días. */
export function PlanPayments({ refresh }: { refresh?: unknown }) {
  const client = useMemo(() => browserClient(), []);
  const { overview, reload } = usePlanOverview(true, refresh);
  const [busy, setBusy] = useState(""), [err, setErr] = useState("");
  if (!overview) return <div className="skeleton-group" role="status" aria-label="Cargando planes"><div className="skeleton" /></div>;
  const counts = Object.values(overview.drivers).reduce<Record<string, number>>((a, d) => { a[d.status] = (a[d.status] || 0) + 1; return a; }, {});
  async function review(id: string, approve: boolean) {
    setBusy(id); setErr("");
    const { error } = await client.rpc("admin_plan_review", { payment_id: id, approve });
    setBusy(""); if (error) setErr("No se pudo actualizar el pago."); else void reload();
  }
  return <article className="trip-card plan-payments">
    <h2>Planes de conductores</h2>
    <div className="stats-grid plan-stats">
      <article><strong>{usd(overview.collected_30d_cents)}</strong><span>Recaudado · 30 días ({overview.payments_30d})</span></article>
      <article><strong>{(counts.active || 0) + (counts.expiring || 0)}</strong><span>Planes activos</span></article>
      <article><strong>{(counts.grace || 0) + (counts.expired || 0) + (counts.none || 0)}</strong><span>Sin plan vigente</span></article>
    </div>
    <h3>Pagos por revisar</h3>
    {overview.pending.length === 0 ? <p className="muted">No hay pagos pendientes.</p> : <ul className="wallet-movements">{overview.pending.map(p => <li key={p.id} className="plan-pending">
      <span><strong>{p.name} · {PLAN[p.plan]} ({p.days} días)</strong>
        <small>{usd(p.amount_cents)}{p.amount_bs != null ? ` · ${bs(Number(p.amount_bs))}` : ""} · {p.bank ? `${bankName(p.bank)} · ` : ""}{p.phone ? `${formatPhone(p.phone)} · ` : ""}Ref. {p.reference ?? "—"} · {date(p.created_at)}</small></span>
      <span className="plan-review-actions">
        <button type="button" className="secondary" disabled={!!busy} onClick={() => void review(p.id, false)}>Rechazar</button>
        <button type="button" className="primary" disabled={!!busy} onClick={() => void review(p.id, true)}>{busy === p.id ? "…" : "Aprobar"}</button>
      </span>
    </li>)}</ul>}
    {err && <p className="payment-error" role="alert">{err}</p>}
  </article>;
}

/** Ficha del conductor: plan, historial y extensión manual (regalo o pago registrado). */
export function AdminDriverPlan({ driverId }: { driverId: string }) {
  const client = useMemo(() => browserClient(), []);
  const [data, setData] = useState<{ plan: PlanState; vehicle: { plate: string; model: string; color: string } | null; duplicates: { id: string; email: string }[] } | null>(null);
  const [days, setDays] = useState(7), [paid, setPaid] = useState(false), [note, setNote] = useState("");
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(""), [err, setErr] = useState("");
  const load = useCallback(async () => { const { data, error } = await client.rpc("admin_driver_profile", { driver_id: driverId }); if (!error) setData(data); }, [client, driverId]);
  useEffect(() => { void load(); }, [load]);
  if (!data) return <div className="skeleton-group" role="status" aria-label="Cargando plan"><div className="skeleton" /></div>;
  const p = data.plan, badge = PLAN_BADGE[p.status], amount = paid ? (days >= 30 ? p.month_cents : p.week_cents) : 0;
  async function extend() {
    setBusy(true); setErr(""); setMsg("");
    const { error } = await client.rpc("admin_plan_extend", { driver_id: driverId, add_days: days, amount_cents: amount, note });
    setBusy(false);
    if (error) setErr("No se pudo extender el plan."); else { setMsg(`Plan extendido ${days} días.`); setNote(""); void load(); }
  }
  return <div className="member-info admin-driver-plan">
    <p>{badge && <span className={"plan-badge is-" + badge[1]}>{badge[0]}</span>} {p.paid_until ? `Hasta el ${date(p.paid_until)}` : "Nunca ha tenido plan"}{p.trial_used ? " · prueba usada" : ""}</p>
    <h3>Extender plan</h3>
    <div className="service-tabs" role="radiogroup" aria-label="Días">
      {[7, 30].map(d => <button key={d} type="button" role="radio" aria-checked={days === d} className={days === d ? "is-active" : ""} onClick={() => setDays(d)}>{d} días</button>)}
    </div>
    <label className="payment-switch"><input type="checkbox" role="switch" checked={paid} onChange={e => setPaid(e.target.checked)} /><span><strong>{paid ? `Pago recibido (${usd(days >= 30 ? p.month_cents : p.week_cents)})` : "Regalo"}</strong><small>{paid ? "Cuenta como recaudado." : "No suma a lo recaudado."}</small></span></label>
    <label>Nota (opcional)<input value={note} maxLength={300} onChange={e => setNote(e.target.value)} placeholder="Ej. pagó por WhatsApp, ref. 123456" /></label>
    <button className="primary" disabled={busy} onClick={() => void extend()}>{busy ? "Guardando…" : `Extender ${days} días`}</button>
    {err && <p className="payment-error" role="alert">{err}</p>}
    {msg && <p className="admin-create-notice" role="status">{msg}</p>}
    <h3>Historial</h3>
    {p.payments.length === 0 ? <p className="muted">Sin pagos todavía.</p> : <ul className="wallet-movements">{p.payments.map(x => <li key={x.id}>
      <span><strong>{PLAN[x.plan]} · {x.days} días</strong><small>{x.note || x.method}{x.reference ? ` · Ref. ${x.reference}` : ""} · {date(x.created_at)}</small></span>
      <b className={x.status === "approved" ? "is-in" : x.status === "rejected" ? "is-out" : ""}>{x.amount_cents ? usd(x.amount_cents) : "Gratis"}{x.status !== "approved" ? ` · ${STATUS[x.status]}` : ""}</b>
    </li>)}</ul>}
  </div>;
}

/** Ficha del conductor (Información): moto y alerta de cuentas duplicadas. */
export function AdminDriverVehicle({ driverId }: { driverId: string }) {
  const client = useMemo(() => browserClient(), []);
  const [data, setData] = useState<{ vehicle: { plate: string; model: string; color: string } | null; duplicates: { id: string; email: string }[] } | null>(null);
  useEffect(() => { let alive = true; void client.rpc("admin_driver_profile", { driver_id: driverId }).then(({ data, error }) => { if (alive && !error) setData(data); }); return () => { alive = false; }; }, [client, driverId]);
  if (!data) return null;
  return <>
    <p className="trip-vehicle">{data.vehicle ? <><span>{data.vehicle.model} · {data.vehicle.color}</span><b>{data.vehicle.plate}</b></> : <span className="muted">Sin moto registrada</span>}</p>
    {data.duplicates.length > 0 && <p className="payment-error" role="alert">Su cuenta de cobro coincide con: {data.duplicates.map(d => d.email).join(", ")}.</p>}
  </>;
}
