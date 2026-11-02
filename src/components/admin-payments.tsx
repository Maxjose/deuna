"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { browserClient } from "@/lib/supabase/client";
import { usd } from "@/lib/fare";
import { bankName, bs, formatPhone, paymentStatusLabel } from "@/lib/payments";
import { parseStoredPlace } from "@/lib/journey";
import { AppIcon } from "./app-icon";
import { AdminTopups } from "./wallet";

type PaymentRow = {
  id: string;
  status: string;
  created_at: string;
  destination: string;
  fare_cents: number | null;
  exchange_rate: number | string | null;
  payment_reference: string | null;
  payment_reported_at: string | null;
  payment_bank: string | null;
  payment_phone: string | null;
  payment_amount_bs: number | string | null;
  payment_status: string | null;
  payment_attempts: number;
  payment_note: string | null;
  payment_verified_at: string | null;
  payment_verified_by: string | null;
};
type Health = { last_run_at: string | null; last_ok: boolean | null; last_message: string | null; enabled: boolean; auto_start: string; auto_end: string; active: boolean };
type Filter = "pending" | "verified" | "rejected" | "all";

const COLUMNS = "id,status,created_at,destination,fare_cents,exchange_rate,payment_reference,payment_reported_at,payment_bank,payment_phone,payment_amount_bs,payment_status,payment_attempts,payment_note,payment_verified_at,payment_verified_by";
const time = (value: string | null) => value ? new Date(value).toLocaleString("es-VE", { dateStyle: "short", timeStyle: "short" }) : "—";

/** Administración: pagos móviles, su verificación con Tesoro Pagos y revisión manual. */
export function AdminPayments({ onMessage }: { onMessage: (text: string) => void }) {
  const client = useMemo(() => browserClient(), []);
  const [rows, setRows] = useState<PaymentRow[]>([]), [health, setHealth] = useState<Health | null>(null);
  const [filter, setFilter] = useState<Filter>("pending"), [loading, setLoading] = useState(true), [busy, setBusy] = useState<string | null>(null), [error, setError] = useState("");
  const [view, setView] = useState<"list" | "settings">("list");
  const load = useCallback(async () => {
    const [list, status] = await Promise.all([
      client.from("trips").select(COLUMNS).eq("payment_method", "pago_movil").order("created_at", { ascending: false }).limit(200),
      client.rpc("payment_health"),
    ]);
    setLoading(false);
    if (list.error) { setError("No pudimos cargar los pagos."); return; }
    setRows(list.data as PaymentRow[]); setError("");
    if (!status.error) setHealth(status.data as Health);
  }, [client]);
  useEffect(() => {
    void load();
    const channel = client.channel("admin-payments").on("postgres_changes", { event: "UPDATE", schema: "public", table: "trips" }, () => void load()).subscribe();
    const timer = setInterval(() => { if (!document.hidden) void load(); }, 20000);
    return () => { void client.removeChannel(channel); clearInterval(timer); };
  }, [client, load]);

  async function act(id: string, action: "approve" | "reject" | "retry") {
    setBusy(id + action);
    const { error } = await client.rpc("admin_payment", { trip_id: id, action });
    setBusy(null);
    if (error) { onMessage(error.message === "La verificación automática no está activa" ? "La verificación automática está desactivada o fuera de horario." : "No se pudo actualizar el pago."); return; }
    onMessage(action === "approve" ? "Pago aprobado." : action === "reject" ? "Pago rechazado." : "Verificación reiniciada.");
    void load();
  }

  const pendingOf = (r: PaymentRow) => !!r.payment_reference && (r.payment_status === "checking" || r.payment_status === "review" || !r.payment_status);
  const counts = {
    pending: rows.filter(pendingOf).length,
    verified: rows.filter((r) => r.payment_status === "verified").length,
    rejected: rows.filter((r) => r.payment_status === "rejected").length,
    waiting: rows.filter((r) => !r.payment_reference && !["cancelled", "searching"].includes(r.status)).length,
  };
  const visible = rows.filter((r) => filter === "all" ? true : filter === "pending" ? pendingOf(r) : r.payment_status === filter);

  if (view === "settings") {
    return (
      <div className="admin-payments">
        <button type="button" className="account-back secondary" onClick={() => setView("list")}>Volver a pagos</button>
        <PaymentAutomationSettings health={health} onSaved={(next, text) => { setHealth(next); onMessage(text); setView("list"); }} />
      </div>
    );
  }
  const schedule = health ? (health.auto_start === health.auto_end ? "todo el día" : `de ${health.auto_start} a ${health.auto_end}`) : "";
  return (
    <div className="admin-payments">
      <AdminTopups onMessage={onMessage} />
      <div className="payments-toolbar">
        <span className={"payments-mode " + (health?.active ? "is-on" : "is-off")}>
          <i aria-hidden="true" />
          {!health ? "Cargando…" : !health.enabled ? "Verificación automática desactivada" : health.active ? `Verificación automática activa · ${schedule}` : `Fuera de horario · activa ${schedule}`}
        </span>
        <button type="button" className="secondary payments-settings-button" onClick={() => setView("settings")}><AppIcon name="settings" />Configuración</button>
      </div>
      <div className={"payments-health " + (health?.last_ok ? "is-ok" : health?.last_ok === false ? "is-bad" : "")} role="status">
        <i aria-hidden="true" />
        <span>
          <strong>{health?.last_ok ? "Conectado a Tesoro Pagos" : health?.last_ok === false ? "Problema con Tesoro Pagos" : "Verificador sin actividad todavía"}</strong>
          <small>{health?.last_run_at ? `${health.last_message || ""} · última consulta ${time(health.last_run_at)}` : "Se activará con el primer pago móvil enviado."}</small>
        </span>
      </div>
      <div className="stats-grid payments-stats">
        <article><strong>{counts.pending}</strong><span>Pendientes</span></article>
        <article><strong>{counts.verified}</strong><span>Verificados</span></article>
        <article><strong>{counts.waiting}</strong><span>Sin referencia</span></article>
      </div>
      <div className="history-filters" role="group" aria-label="Filtrar pagos">
        {([["pending", `Pendientes (${counts.pending})`], ["verified", "Verificados"], ["rejected", "Rechazados"], ["all", "Todos"]] as const).map(([value, label]) => (
          <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>
        ))}
      </div>
      {error && <p className="payment-error" role="alert">{error}</p>}
      {loading ? <div className="skeleton-group" role="status" aria-label="Cargando pagos"><div className="skeleton" /><div className="skeleton" /></div> : (
        <div className="payments-list">
          {visible.map((r) => {
            const state = paymentStatusLabel(r.payment_status, !!r.payment_reference);
            const amount = r.payment_amount_bs != null ? Number(r.payment_amount_bs) : null;
            return (
              <article key={r.id} className="trip-card payment-row">
                <div className="row">
                  <span className={"pill payment-pill is-" + state.tone}>{r.payment_reference && r.payment_status !== "verified" && r.payment_status !== "rejected" ? (r.payment_status === "checking" ? "Verificando" : "Pendiente") : state.label}</span>
                  <small>#{r.id.slice(0, 6)} · {time(r.payment_reported_at ?? r.created_at)}</small>
                </div>
                <div className="payment-row-main">
                  <strong>{amount != null ? bs(amount) : "—"}</strong>
                  {r.fare_cents != null && <span>{usd(r.fare_cents)}</span>}
                </div>
                <dl className="payment-row-data">
                  <div><dt>Referencia</dt><dd>{r.payment_reference ?? "—"}</dd></div>
                  <div><dt>Banco</dt><dd>{r.payment_bank ? `${bankName(r.payment_bank)} (${r.payment_bank})` : "—"}</dd></div>
                  <div><dt>Teléfono</dt><dd>{r.payment_phone ? formatPhone(r.payment_phone) : "—"}</dd></div>
                  <div><dt>Destino</dt><dd>{parseStoredPlace(r.destination).label.split(",")[0]}</dd></div>
                </dl>
                {(r.payment_note || r.payment_status === "checking") && (
                  <p className="payment-row-note">
                    {r.payment_status === "checking" ? `Intento ${r.payment_attempts + 1} de verificación automática. ` : ""}
                    {r.payment_note}{r.payment_verified_by === "admin" ? " · aprobado manualmente" : ""}
                  </p>
                )}
                {r.payment_reference && r.payment_status !== "verified" && (
                  <div className="payment-row-actions">
                    <button className="primary" disabled={!!busy} onClick={() => void act(r.id, "approve")}><AppIcon name="check" />Aprobar</button>
                    {r.payment_bank && r.payment_phone && <button className="secondary" disabled={!!busy} onClick={() => void act(r.id, "retry")}>Verificar de nuevo</button>}
                    {r.payment_status !== "rejected" && <button className="secondary danger" disabled={!!busy} onClick={() => void act(r.id, "reject")}>Rechazar</button>}
                  </div>
                )}
              </article>
            );
          })}
          {visible.length === 0 && (
            <div className="empty">
              <span className="empty-icon"><AppIcon name="payments" /></span>
              <h2>{filter === "pending" ? "No hay pagos pendientes" : "Sin pagos en esta lista"}</h2>
              <p>Los pagos móviles de los viajes aparecerán aquí.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Configuración de la verificación automática: interruptor y horario (hora de Venezuela). */
function PaymentAutomationSettings({ health, onSaved }: { health: Health | null; onSaved: (health: Health, message: string) => void }) {
  const client = useMemo(() => browserClient(), []);
  const [enabled, setEnabled] = useState(health?.enabled ?? true);
  const [allDay, setAllDay] = useState(!health || health.auto_start === health.auto_end);
  const [start, setStart] = useState(health && health.auto_start !== health.auto_end ? health.auto_start : "07:00");
  const [end, setEnd] = useState(health && health.auto_start !== health.auto_end ? health.auto_end : "21:00");
  const [saving, setSaving] = useState(false), [error, setError] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!allDay && start === end) { setError("La hora de inicio y la de cierre no pueden ser iguales. Marca «Todo el día» si quieres verificar siempre."); return; }
    setSaving(true); setError("");
    const { data, error } = await client.rpc("save_payment_automation", { enabled, auto_start: allDay ? "00:00" : start, auto_end: allDay ? "00:00" : end });
    setSaving(false);
    if (error || !data) { setError("No se pudo guardar la configuración."); return; }
    onSaved(data as Health, enabled ? "Verificación automática activada." : "Verificación automática desactivada.");
  }
  return (
    <form className="trip-card payment-automation" onSubmit={save}>
      <h2>Verificación automática</h2>
      <p className="muted">Cuando está activa, De1na confirma los pagos móviles con Tesoro Pagos. Desactivada o fuera de horario, no se conecta al banco y los pagos quedan pendientes para que los revises en esta sección.</p>
      <label className="payment-switch">
        <input type="checkbox" role="switch" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <span><strong>{enabled ? "Activada" : "Desactivada"}</strong><small>{enabled ? "Se verificarán los pagos dentro del horario." : "No se verificará ningún pago automáticamente."}</small></span>
      </label>
      <fieldset disabled={!enabled}>
        <legend>Horario de verificación (hora de Venezuela)</legend>
        <label className="check">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          Todo el día
        </label>
        {!allDay && (
          <div className="two">
            <label>Hora de inicio<input type="time" required value={start} onChange={(e) => setStart(e.target.value)} /></label>
            <label>Hora de cierre<input type="time" required value={end} onChange={(e) => setEnd(e.target.value)} /></label>
          </div>
        )}
        {!allDay && start > end && <p className="muted">El horario cruza la medianoche: de {start} de un día a {end} del siguiente.</p>}
      </fieldset>
      {error && <p className="payment-error" role="alert">{error}</p>}
      <button className="primary" disabled={saving}>{saving ? "Guardando…" : "Guardar configuración"}</button>
    </form>
  );
}
