"use client";
import { useState } from "react";
import { usd } from "@/lib/fare";
import type { PaymentSettings } from "@/lib/payments";
import { AppIcon } from "./app-icon";
import { CopyRow, type PaymentTrip } from "./trip-payment";

/** Monto en USDT (1 USD = 1 USDT), con dos decimales. */
export const usdt = (cents: number) => (cents / 100).toFixed(2);

/** Envía un ID de transacción de Binance Pay para verificarlo en el servidor. */
export async function verifyBinance(payload: { kind: "trip" | "topup"; trip_id?: string; transaction_id: string }) {
  const response = await fetch("/api/binance/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "No pudimos verificar el pago.");
  return body as { status: string; amount_cents?: number; balance_cents?: number };
}

export function BinanceInstructions({ settings, amountCents }: { settings: PaymentSettings | null; amountCents?: number }) {
  if (!settings?.binance_pay_id) return <p className="payment-error">Binance Pay no está configurado.</p>;
  return <>
    <ol className="binance-steps">
      <li>Abre Binance → <strong>Pay</strong> → <strong>Enviar</strong>.</li>
      <li>Envía {amountCents != null ? <strong>{usdt(amountCents)} USDT</strong> : "el monto en USDT"} al Pay ID de De1na.</li>
      <li>Abre el detalle del pago, copia el <strong>ID de la transacción</strong> y pégalo aquí.</li>
    </ol>
    <div className="payment-data">
      <CopyRow label="Pay ID de De1na" value={settings.binance_pay_id} />
      {amountCents != null && <CopyRow label="Monto (USDT)" value={usdt(amountCents)} />}
    </div>
  </>;
}

/** Pasajero: pagar el viaje por Binance Pay (cuando un conductor acepta) y verificar el ID de transacción. */
export function BinancePayment({ trip, settings, offline }: { trip: PaymentTrip; settings: PaymentSettings | null; offline: boolean }) {
  const [tx, setTx] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [done, setDone] = useState(false);
  if (trip.fare_cents == null) return null;
  if (trip.status === "searching") return <div className="payment-panel is-cash"><AppIcon name="wallet" /><p><strong>Pagarás con Binance Pay</strong><span>Te mostraremos los datos cuando un conductor acepte tu viaje.</span></p></div>;
  if (trip.status === "cancelled") return null;
  if (trip.payment_status === "verified" || done) return <div className="payment-panel is-cash"><AppIcon name="check" /><p><strong>Pago con Binance verificado</strong><span>{usdt(trip.fare_cents)} USDT recibidos. ¡Gracias!</span></p></div>;
  return (
    <form className="payment-panel binance-panel" onSubmit={async e => {
      e.preventDefault(); if (busy || offline) return;
      setBusy(true); setError("");
      try { await verifyBinance({ kind: "trip", trip_id: trip.id, transaction_id: tx }); setDone(true); }
      catch (err) { setError(err instanceof Error ? err.message : "No pudimos verificar el pago."); }
      finally { setBusy(false); }
    }}>
      <div className="binance-head"><AppIcon name="wallet" /><p><strong>Paga con Binance Pay</strong><span>Total: {usd(trip.fare_cents)} = {usdt(trip.fare_cents)} USDT</span></p></div>
      <BinanceInstructions settings={settings} amountCents={trip.fare_cents} />
      <label>ID de la transacción<input value={tx} onChange={e => setTx(e.target.value.replace(/\s/g, ""))} inputMode="text" autoComplete="off" maxLength={64} placeholder="Pega aquí el ID" required disabled={busy} /></label>
      {error && <p className="payment-error" role="alert">{error}</p>}
      <button className="primary" disabled={busy || offline || tx.length < 6}>{busy ? "Verificando…" : "Verificar pago"}</button>
    </form>
  );
}
