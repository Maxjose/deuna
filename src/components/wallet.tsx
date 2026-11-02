"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { browserClient } from "@/lib/supabase/client";
import { usd } from "@/lib/fare";
import { VE_BANKS, bankName, binanceReady, cleanPhone, pagoMovilReady, type PaymentSettings } from "@/lib/payments";
import { BinanceInstructions, verifyBinance } from "./binance-payment";
import { AppIcon } from "./app-icon";

export type Movement = { id: string; amount_cents: number; kind: string; trip_id: string | null; note: string | null; created_at: string };
export type Wallet = { balance_cents: number; topup_enabled: boolean; movements: Movement[]; topups: { id: string; amount_cents: number; reference: string; status: string; created_at: string }[] };
const KIND: Record<string, string> = { refund: "Reembolso", trip_payment: "Pago de viaje", admin_credit: "Abono", admin_debit: "Cargo", topup: "Recarga" };
const date = (v: string) => new Date(v).toLocaleString("es-VE", { dateStyle: "medium", timeStyle: "short" });
const ERRORS: Record<string, string> = {
  "Saldo insuficiente": "No tienes saldo suficiente.", "Recargas no disponibles": "Las recargas no están disponibles por ahora.",
  "Monto inválido": "Escribe un monto válido.", "Referencia inválida": "Escribe los últimos 6 dígitos de la referencia.",
  "Banco inválido": "Selecciona el banco de origen.", "Teléfono inválido": "Escribe el teléfono de origen, por ejemplo 0412 1234567.",
  "Tienes recargas pendientes": "Ya tienes recargas en revisión. Espera a que se aprueben.", "Esta referencia ya fue usada": "Esta referencia ya fue usada.",
};
const fail = (e: { message?: string } | null) => ERRORS[e?.message || ""] || "No pudimos completar la operación. Inténtalo de nuevo.";

export function useWallet(enabled: boolean) {
  const client = useMemo(() => browserClient(), []);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const reload = useCallback(async () => { if (!enabled) return; const { data, error } = await client.rpc("my_wallet"); if (!error && data) setWallet(data as Wallet); }, [client, enabled]);
  useEffect(() => { void reload(); }, [reload]);
  return { wallet, reload };
}

function Movements({ items }: { items: Movement[] }) {
  if (!items.length) return <p className="muted">Todavía no hay movimientos.</p>;
  return <ul className="wallet-movements">{items.map(m => <li key={m.id}>
    <span><strong>{KIND[m.kind] || m.kind}</strong><small>{m.note ? `${m.note} · ` : ""}{date(m.created_at)}</small></span>
    <b className={m.amount_cents > 0 ? "is-in" : "is-out"}>{m.amount_cents > 0 ? "+" : "−"}{usd(Math.abs(m.amount_cents))}</b>
  </li>)}</ul>;
}

/** Pasajero: saldo, movimientos y recarga (si la administración la activó). */
export function WalletView({ wallet, settings, onChanged }: { wallet: Wallet | null; settings: PaymentSettings | null; onChanged: () => void }) {
  const client = useMemo(() => browserClient(), []);
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(""), [err, setErr] = useState(""), [open, setOpen] = useState(false);
  const canPagoMovil = pagoMovilReady(settings), canBinance = binanceReady(settings);
  const [via, setVia] = useState<"pago_movil" | "binance">(canPagoMovil ? "pago_movil" : "binance");
  const [tx, setTx] = useState("");
  if (!wallet) return <div className="skeleton-group" role="status" aria-label="Cargando saldo"><div className="skeleton" /></div>;
  async function topup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget), phone = cleanPhone(String(f.get("phone") || ""));
    if (!phone) { setErr(ERRORS["Teléfono inválido"]); return; }
    setBusy(true); setErr(""); setMsg("");
    const { error } = await client.rpc("wallet_request_topup", { amount_cents: Math.round(Number(String(f.get("amount")).replace(",", ".")) * 100), reference: String(f.get("reference") || ""), bank: String(f.get("bank") || ""), phone });
    setBusy(false);
    if (error) { setErr(fail(error)); return; }
    setMsg("Recibimos tu recarga. La verás en tu saldo cuando se apruebe."); setOpen(false); onChanged();
  }
  async function topupBinance(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(""); setMsg("");
    try { const r = await verifyBinance({ kind: "topup", transaction_id: tx }); setMsg(`Recarga acreditada: +${usd(r.amount_cents ?? 0)}.`); setTx(""); setOpen(false); onChanged(); }
    catch (error) { setErr(error instanceof Error ? error.message : "No pudimos verificar el pago."); }
    finally { setBusy(false); }
  }
  const topupAvailable = wallet.topup_enabled && (canPagoMovil || canBinance);
  const pending = wallet.topups.filter(t => t.status === "pending");
  return <div className="account-stack">
    <article className="trip-card wallet-card">
      <span className="wallet-eyebrow">TU SALDO</span>
      <strong className="wallet-amount">{usd(wallet.balance_cents)}</strong>
      <p className="muted">Úsalo para pagar tus viajes. Si un viaje pagado se cancela, el dinero vuelve aquí.</p>
      {topupAvailable && !open && <button className="primary" onClick={() => { setOpen(true); setErr(""); setMsg(""); }}><AppIcon name="wallet" />Recargar saldo</button>}
      {msg && <p className="admin-create-notice" role="status">{msg}</p>}
    </article>
    {topupAvailable && open && canPagoMovil && canBinance && <div className="service-tabs" role="radiogroup" aria-label="Método de recarga">
      <button type="button" role="radio" aria-checked={via === "pago_movil"} className={via === "pago_movil" ? "is-active" : ""} onClick={() => { setVia("pago_movil"); setErr(""); }}>Pago móvil</button>
      <button type="button" role="radio" aria-checked={via === "binance"} className={via === "binance" ? "is-active" : ""} onClick={() => { setVia("binance"); setErr(""); }}>Binance Pay</button>
    </div>}
    {topupAvailable && open && (via === "binance" || !canPagoMovil) && <form className="trip-card wallet-topup" onSubmit={topupBinance}>
      <h2>Recargar con Binance Pay</h2>
      <p className="muted">Envía la cantidad de USDT que quieras recargar (de 1 a 1000). Se acredita al instante: 1 USDT = $1.</p>
      <BinanceInstructions settings={settings} />
      <label>ID de la transacción<input value={tx} onChange={e => setTx(e.target.value.replace(/\s/g, ""))} maxLength={64} autoComplete="off" placeholder="Pega aquí el ID" required disabled={busy} /></label>
      {err && <p className="payment-error" role="alert">{err}</p>}
      <button className="primary" disabled={busy || tx.length < 6}>{busy ? "Verificando…" : "Verificar y recargar"}</button>
      <button type="button" className="text" disabled={busy} onClick={() => setOpen(false)}>Cancelar</button>
    </form>}
    {topupAvailable && open && via === "pago_movil" && canPagoMovil && <form className="trip-card wallet-topup" onSubmit={topup}>
      <h2>Recargar con pago móvil</h2>
      {settings?.pago_movil_bank && <p className="muted">Haz un pago móvil a {settings.pago_movil_bank} · {settings.pago_movil_phone} · {settings.pago_movil_id} y luego informa los datos.</p>}
      <label>Monto a recargar (USD)<input name="amount" type="number" min="1" max="1000" step="0.01" required disabled={busy} /></label>
      <label>Banco de origen<select name="bank" required disabled={busy} defaultValue=""><option value="">Selecciona tu banco</option>{VE_BANKS.map(([c, n]) => <option key={c} value={c}>{n} ({c})</option>)}</select></label>
      <label>Teléfono de origen<input name="phone" type="tel" inputMode="tel" placeholder="0412 1234567" required disabled={busy} /></label>
      <label>Referencia (últimos 6 dígitos)<input name="reference" inputMode="numeric" maxLength={20} required disabled={busy} /></label>
      {err && <p className="payment-error" role="alert">{err}</p>}
      <button className="primary" disabled={busy}>{busy ? "Enviando…" : "Informar recarga"}</button>
      <button type="button" className="text" disabled={busy} onClick={() => setOpen(false)}>Cancelar</button>
    </form>}
    {pending.length > 0 && <article className="trip-card"><h2>Recargas en revisión</h2><ul className="wallet-movements">{pending.map(t => <li key={t.id}><span><strong>Ref. {t.reference}</strong><small>{date(t.created_at)}</small></span><b>{usd(t.amount_cents)}</b></li>)}</ul></article>}
    <article className="trip-card"><h2>Movimientos</h2><Movements items={wallet.movements} /></article>
  </div>;
}

/** Pagar un saldo pendiente con el saldo de la cuenta. */
export function SettleWithWallet({ tripId, fareCents, balanceCents, onDone }: { tripId: string; fareCents: number; balanceCents: number; onDone: () => void }) {
  const client = useMemo(() => browserClient(), []);
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  if (balanceCents < fareCents) return null;
  return <div className="wallet-settle">
    <button className="primary" disabled={busy} onClick={async () => { setBusy(true); setErr(""); const { error } = await client.rpc("wallet_settle_trip", { trip_id: tripId }); setBusy(false); if (error) setErr(fail(error)); else onDone(); }}>
      <AppIcon name="wallet" />{busy ? "Pagando…" : `Pagar con mi saldo (${usd(balanceCents)})`}</button>
    {err && <p className="payment-error" role="alert">{err}</p>}
  </div>;
}

/** Administración: saldo de una persona, abonos y cargos manuales. */
export function AdminWallet({ personId }: { personId: string }) {
  const client = useMemo(() => browserClient(), []);
  const [data, setData] = useState<{ balance_cents: number; movements: Movement[] } | null>(null);
  const [busy, setBusy] = useState(false), [err, setErr] = useState(""), [mode, setMode] = useState<"credit" | "debit">("credit");
  const load = useCallback(async () => { const { data } = await client.rpc("admin_wallet", { person_id: personId }); if (data) setData(data); }, [client, personId]);
  useEffect(() => { void load(); }, [load]);
  async function adjust(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget, f = new FormData(form), cents = Math.round(Number(String(f.get("amount")).replace(",", ".")) * 100);
    if (!cents || cents <= 0) { setErr("Escribe un monto válido."); return; }
    setBusy(true); setErr("");
    const { data, error } = await client.rpc("admin_wallet_adjust", { person_id: personId, amount_cents: mode === "credit" ? cents : -cents, note: String(f.get("note") || "") });
    setBusy(false);
    if (error) { setErr(fail(error)); return; }
    setData(data); form.reset();
  }
  return <div className="admin-wallet">
    <div className="row"><h3>Saldo</h3><strong className="admin-wallet-amount">{data ? usd(data.balance_cents) : "…"}</strong></div>
    <form className="admin-wallet-form" onSubmit={adjust}>
      <div className="service-tabs" role="radiogroup" aria-label="Tipo de ajuste">
        <button type="button" role="radio" aria-checked={mode === "credit"} className={mode === "credit" ? "is-active" : ""} onClick={() => setMode("credit")}>Agregar saldo</button>
        <button type="button" role="radio" aria-checked={mode === "debit"} className={mode === "debit" ? "is-active" : ""} onClick={() => setMode("debit")}>Descontar</button>
      </div>
      <div className="two">
        <label>Monto (USD)<input name="amount" type="number" min="0.01" max="1000" step="0.01" required disabled={busy} /></label>
        <label>Motivo<input name="note" maxLength={200} placeholder="Ej. compensación" disabled={busy} /></label>
      </div>
      {err && <p className="payment-error" role="alert">{err}</p>}
      <button className="secondary" disabled={busy}>{busy ? "Guardando…" : mode === "credit" ? "Agregar saldo" : "Descontar saldo"}</button>
    </form>
    {data && data.movements.length > 0 && <details className="admin-wallet-movements"><summary>Ver movimientos ({data.movements.length})</summary><Movements items={data.movements} /></details>}
  </div>;
}

type Topup = { id: string; user_id: string; name: string; amount_cents: number; amount_bs: number | null; reference: string; bank: string; phone: string; created_at: string };
/** Administración: recargas de saldo pendientes de revisión (solo aparece si hay alguna). */
export function AdminTopups({ onMessage }: { onMessage: (text: string) => void }) {
  const client = useMemo(() => browserClient(), []);
  const [items, setItems] = useState<Topup[]>([]), [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => { const { data } = await client.rpc("admin_topups"); if (Array.isArray(data)) setItems(data); }, [client]);
  useEffect(() => { void load(); }, [load]);
  if (!items.length) return null;
  async function review(id: string, approve: boolean) {
    setBusy(id); const { error } = await client.rpc("admin_review_topup", { topup_id: id, approve }); setBusy(null);
    onMessage(error ? "No se pudo actualizar la recarga." : approve ? "Recarga aprobada y abonada." : "Recarga rechazada."); void load();
  }
  return <article className="trip-card admin-topups">
    <h2>Recargas de saldo pendientes ({items.length})</h2>
    {items.map(t => <div key={t.id} className="admin-topup">
      <span><strong>{t.name} · {usd(t.amount_cents)}</strong><small>{t.amount_bs != null ? `Bs. ${Number(t.amount_bs).toLocaleString("es-VE", { minimumFractionDigits: 2 })} · ` : ""}Ref. {t.reference} · {bankName(t.bank)} · {t.phone} · {date(t.created_at)}</small></span>
      <span className="admin-topup-actions"><button className="primary" disabled={!!busy} onClick={() => void review(t.id, true)}>Aprobar</button><button className="secondary danger" disabled={!!busy} onClick={() => void review(t.id, false)}>Rechazar</button></span>
    </div>)}
  </article>;
}

/** Administración: activar o desactivar las recargas de saldo. */
export function WalletSettings({ enabled, onSaved }: { enabled: boolean; onSaved: (text: string) => void }) {
  const client = useMemo(() => browserClient(), []);
  const [on, setOn] = useState(enabled), [busy, setBusy] = useState(false);
  return <form className="trip-card" onSubmit={async e => { e.preventDefault(); setBusy(true); const { error } = await client.rpc("admin_wallet_settings", { topup_enabled: on }); setBusy(false); onSaved(error ? "No se pudo guardar." : on ? "Recargas de saldo activadas." : "Recargas de saldo desactivadas."); }}>
    <h2>Saldo De1na</h2>
    <p className="muted">Los reembolsos de viajes cancelados y los abonos de la administración van al saldo de cada usuario, que puede usarlo para pagar viajes. Las recargas permiten que el usuario informe un pago móvil para agregar saldo; tú las apruebas en Pagos.</p>
    <label className="payment-switch"><input type="checkbox" role="switch" checked={on} onChange={e => setOn(e.target.checked)} /><span><strong>{on ? "Recargas activadas" : "Recargas desactivadas"}</strong><small>{on ? "Los usuarios ven el botón «Recargar saldo»." : "El botón de recarga no se muestra."}</small></span></label>
    <button className="primary" disabled={busy}>{busy ? "Guardando…" : "Guardar"}</button>
  </form>;
}

/** Administración: activar o desactivar pago móvil y Binance Pay (Pay ID de la cuenta receptora). */
export function PaymentMethodsSettings({ settings, onSaved }: { settings: PaymentSettings; onSaved: (text: string) => void }) {
  const client = useMemo(() => browserClient(), []);
  const [pm, setPm] = useState(settings.pago_movil_enabled !== false), [bn, setBn] = useState(!!settings.binance_enabled), [payId, setPayId] = useState(settings.binance_pay_id || "");
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  return <form className="trip-card" onSubmit={async e => {
    e.preventDefault(); setBusy(true); setErr("");
    const { error } = await client.rpc("admin_payment_methods", { pago_movil_enabled: pm, binance_enabled: bn, binance_pay_id: payId });
    setBusy(false);
    if (error) { setErr(error.message === "Falta el Pay ID" ? "Escribe el Pay ID para activar Binance Pay." : error.message === "Pay ID inválido" ? "El Pay ID debe tener solo números." : "No se pudo guardar."); return; }
    onSaved("Métodos de pago actualizados.");
  }}>
    <h2>Métodos de pago</h2>
    <p className="muted">Desactivar un método lo oculta al solicitar viajes y recargas. Los viajes ya solicitados con ese método no cambian.</p>
    <label className="payment-switch"><input type="checkbox" role="switch" checked={pm} onChange={e => setPm(e.target.checked)} /><span><strong>Pago móvil {pm ? "activado" : "desactivado"}</strong><small>Transferencia en bolívares con verificación por referencia.</small></span></label>
    <label className="payment-switch"><input type="checkbox" role="switch" checked={bn} onChange={e => setBn(e.target.checked)} /><span><strong>Binance Pay {bn ? "activado" : "desactivado"}</strong><small>Pago en USDT a tu Pay ID, verificado al instante con el ID de la transacción.</small></span></label>
    <label>Pay ID de Binance<input inputMode="numeric" value={payId} onChange={e => setPayId(e.target.value)} placeholder="Ej. 65038281" maxLength={15} disabled={busy} /></label>
    {err && <p className="payment-error" role="alert">{err}</p>}
    <button className="primary" disabled={busy}>{busy ? "Guardando…" : "Guardar métodos de pago"}</button>
  </form>;
}
