"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { browserClient } from "@/lib/supabase/client";
import { usd } from "@/lib/fare";
import { bankName, formatPhone } from "@/lib/payments";
import { parseStoredPlace } from "@/lib/journey";
import { AppIcon } from "./app-icon";

type Movement = { id: string; amount_cents: number; kind: string; trip_id: string | null; method: string | null; reference: string | null; note: string | null; created_at: string; destination: string | null; fare_cents?: number | null; commission_cents?: number };
export type Earnings = { balance_cents: number; earned_cents: number; paid_cents: number; commission_cents?: number; movements: Movement[]; payout_account?: { bank?: string; id_number?: string; phone?: string } | null };
const METHOD: Record<string, string> = { pago_movil: "Pago móvil", binance: "Binance Pay", wallet: "Saldo De1na" };
const when = (v: string) => new Date(v).toLocaleString("es-VE", { dateStyle: "medium", timeStyle: "short" });

function MovementList({ items }: { items: Movement[] }) {
  const [filter, setFilter] = useState<"all" | "trips" | "payouts">("all");
  const visible = items.filter(m => filter === "all" || (filter === "trips" ? m.kind === "trip_credit" || m.kind === "commission" : m.kind === "payout" || m.kind === "adjustment"));
  return <>
    <div className="history-filters" role="group" aria-label="Filtrar movimientos">
      {([["all", "Todos"], ["trips", "Viajes"], ["payouts", "Pagos recibidos"]] as const).map(([v, l]) =>
        <button key={v} type="button" aria-pressed={filter === v} onClick={() => setFilter(v)}>{l}</button>)}
    </div>
    {visible.length === 0 ? <p className="muted">No hay movimientos en esta lista.</p> :
      <ul className="earnings-list">{visible.map(m => {
        const trip = m.kind === "trip_credit", fee = m.kind === "commission";
        const place = m.destination ? parseStoredPlace(m.destination).label.split(",")[0] : "—";
        const detail = trip ? [`${METHOD[m.method || ""] || "App"}`, m.commission_cents ? `${usd(m.fare_cents ?? 0)} − comisión ${usd(m.commission_cents)}` : null]
          : fee ? [m.note] : [m.reference ? `Ref. ${m.reference}` : null, m.note];
        return <li key={m.id} className={trip ? "is-trip" : fee ? "is-fee" : "is-payout"}>
          <span className="earnings-icon" aria-hidden="true"><AppIcon name={trip ? "moto" : fee ? "cash" : "wallet"} /></span>
          <span className="earnings-main">
            <strong>{trip ? `Viaje · ${place}` : fee ? `Comisión · ${place}` : "Pago de De1na"}</strong>
            <small>{detail.filter(Boolean).join(" · ")} · {when(m.created_at)}</small>
          </span>
          <b>{m.amount_cents > 0 ? "+" : "−"}{usd(Math.abs(m.amount_cents))}</b>
        </li>;
      })}</ul>}
  </>;
}

function Summary({ e }: { e: Earnings }) {
  return <article className="trip-card earnings-summary">
    <span className="wallet-eyebrow">{e.balance_cents < 0 ? "DEBES A DE1NA" : "POR COBRAR"}</span>
    <strong className="wallet-amount">{usd(Math.abs(e.balance_cents))}</strong>
    <div className="earnings-totals">
      <span><small>Acumulado por viajes</small><strong>{usd(e.earned_cents)}</strong></span>
      <span><small>Pagado por De1na</small><strong>{usd(e.paid_cents)}</strong></span>
    </div>
    {!!e.commission_cents && <p className="muted earnings-fee">Comisión De1na descontada: {usd(e.commission_cents)}</p>}
  </article>;
}

/** Conductor: ganancias de viajes cobrados por la app y pagos recibidos de De1na. */
export function DriverEarnings({ refresh }: { refresh: unknown }) {
  const client = useMemo(() => browserClient(), []);
  const [e, setE] = useState<Earnings | null>(null), [error, setError] = useState(false);
  const load = useCallback(async () => { const { data, error } = await client.rpc("my_earnings"); if (error) setError(true); else { setE(data); setError(false); } }, [client]);
  useEffect(() => { void load(); }, [load, refresh]);
  if (error && !e) return <p className="payment-error" role="alert">No pudimos cargar tus ganancias. <button className="text" onClick={() => void load()}>Reintentar</button></p>;
  if (!e) return <div className="skeleton-group" role="status" aria-label="Cargando ganancias"><div className="skeleton" /><div className="skeleton" /></div>;
  return <div className="account-stack earnings">
    <Summary e={e} />
    <p className="muted earnings-note">Aquí se acreditan los viajes pagados por pago móvil, Binance Pay o saldo. Los viajes en efectivo los cobras directamente.</p>
    <article className="trip-card"><h2>Movimientos</h2><MovementList items={e.movements} /></article>
  </div>;
}

/** Administración (ficha del conductor): datos de cobro, acumulado y registrar pagos al conductor. */
export function AdminDriverEarnings({ driverId }: { driverId: string }) {
  const client = useMemo(() => browserClient(), []);
  const [e, setE] = useState<Earnings | null>(null), [busy, setBusy] = useState(false), [err, setErr] = useState(""), [ok, setOk] = useState("");
  const load = useCallback(async () => { const { data } = await client.rpc("admin_driver_earnings", { driver_id: driverId }); if (data) setE(data); }, [client, driverId]);
  useEffect(() => { void load(); }, [load]);
  const acc = e?.payout_account;
  async function pay(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const form = ev.currentTarget, f = new FormData(form), cents = Math.round(Number(String(f.get("amount")).replace(",", ".")) * 100);
    if (!cents || cents <= 0) { setErr("Escribe un monto válido."); return; }
    setBusy(true); setErr(""); setOk("");
    const { data, error } = await client.rpc("admin_driver_payout", { driver_id: driverId, amount_cents: cents, reference: String(f.get("reference") || ""), note: String(f.get("note") || "") });
    setBusy(false);
    if (error) { setErr(error.message === "Monto mayor al acumulado" ? "El monto es mayor a lo que se le debe." : "No se pudo registrar el pago."); return; }
    setE(data); form.reset(); setOk("Pago registrado.");
  }
  return <div className="admin-wallet admin-earnings">
    <h3>Cuenta de cobro</h3>
    {acc?.bank ? <dl className="payout-account">
      <div><dt>Banco</dt><dd>{bankName(acc.bank)} ({acc.bank})</dd></div>
      <div><dt>Cédula</dt><dd>{acc.id_number}</dd></div>
      <div><dt>Teléfono</dt><dd>{acc.phone ? formatPhone(acc.phone) : "—"}</dd></div>
    </dl> : <p className="muted">El conductor aún no registra su pago móvil en «Mis cuentas».</p>}
    <div className="row"><h3>Por pagar</h3><strong className="admin-wallet-amount">{e ? usd(e.balance_cents) : "…"}</strong></div>
    {e && <p className="muted">Acumulado {usd(e.earned_cents)} · Pagado {usd(e.paid_cents)}</p>}
    <form className="admin-wallet-form" onSubmit={pay}>
      <div className="two">
        <label>Monto pagado (USD)<input name="amount" type="number" min="0.01" step="0.01" max={e ? e.balance_cents / 100 : undefined} required disabled={busy || !e?.balance_cents} defaultValue={undefined} /></label>
        <label>Referencia<input name="reference" maxLength={80} placeholder="Ref. del pago móvil" disabled={busy} /></label>
      </div>
      <label>Nota<input name="note" maxLength={200} placeholder="Ej. pago semanal" disabled={busy} /></label>
      {err && <p className="payment-error" role="alert">{err}</p>}
      {ok && <p className="admin-create-notice" role="status">{ok}</p>}
      <button className="primary" disabled={busy || !e?.balance_cents}>{busy ? "Registrando…" : "Registrar pago al conductor"}</button>
    </form>
    {e && e.movements.length > 0 && <details className="admin-wallet-movements"><summary>Ver movimientos ({e.movements.length})</summary><MovementList items={e.movements} /></details>}
  </div>;
}
