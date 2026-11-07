"use client";
import { useMemo, useState } from "react";
import { browserClient } from "@/lib/supabase/client";
import type { FareSettings as Settings } from '@/lib/fare';

/** Tarifas de moto y tarifa nocturna, en recuadros separados (cada uno se guarda por su cuenta). */
export function FareSettings({ settings, busy, onSave, onSaved }: { settings: Settings; busy: boolean; onSave: (payload: Record<string, unknown>) => void; onSaved?: (text: string) => void }) {
  const fares = { base_cents: settings.base_cents, per_km_cents: settings.per_km_cents, minimum_cents: settings.minimum_cents, rounding_cents: settings.rounding_cents ?? 50 };
  return <div className="settings-grid">
    <form className="trip-card fare-settings" onSubmit={e => {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      onSave({ base_cents: Math.round(Number(form.get('base')) * 100), per_km_cents: Math.round(Number(form.get('km')) * 100), minimum_cents: Math.round(Number(form.get('minimum')) * 100), rounding_cents: Number(form.get('rounding')) });
    }}>
      <h2>Tarifas de moto · USD</h2>
      <p className="muted">Precio: base + kilómetros por carretera × precio por km. Se aplica la tarifa mínima cuando el cálculo es menor.</p>
      <div className="two">
        <label>Tarifa base (USD)<input name="base" type="number" min="0" max="10000" step="0.01" required defaultValue={settings.base_cents / 100} /></label>
        <label>Precio por km (USD)<input name="km" type="number" min="0.01" max="10000" step="0.01" required defaultValue={settings.per_km_cents ? settings.per_km_cents / 100 : ''} placeholder="Define el precio por km" /></label>
      </div>
      <label>Tarifa mínima (USD)<input name="minimum" type="number" min="0" max="10000" step="0.01" required defaultValue={settings.minimum_cents / 100} /></label>
      <label>Redondeo de tarifa<select name="rounding" defaultValue={settings.rounding_cents ?? 50}><option value="50">Hacia arriba cada $0.50</option><option value="100">Hacia arriba cada $1.00</option><option value="1">Sin redondeo adicional</option></select></label>
      <p className="muted">El redondeo se aplica al final. Cada $0.50: $1.20 pasa a $1.50 y $1.80 pasa a $2.00. Los precios confirmados no cambian al actualizar las tarifas; las cotizaciones duran cinco minutos.</p>
      <button className="primary" disabled={busy}>Guardar tarifas</button>
    </form>
    <form className="trip-card night-fare" onSubmit={e => {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      onSave({ ...fares, night_enabled: form.get('night') === 'on', night_start: String(form.get('nightStart') || '20:00'), night_end: String(form.get('nightEnd') || '05:00'), night_percent: Math.round(Number(form.get('nightPercent')) || 0) });
    }}>
      <h2>🌙 Tarifa nocturna de moto</h2>
      <p className="muted">Durante este horario (hora de Venezuela) el precio del viaje sube el porcentaje indicado, antes del redondeo. Puede cruzar la medianoche, por ejemplo de 20:00 a 05:00.</p>
      <label className="check"><input name="night" type="checkbox" defaultChecked={!!settings.night_enabled} />Aplicar recargo nocturno</label>
      <div className="two">
        <label>Inicio<input name="nightStart" type="time" required defaultValue={(settings.night_start || '20:00').slice(0, 5)} /></label>
        <label>Cierre<input name="nightEnd" type="time" required defaultValue={(settings.night_end || '05:00').slice(0, 5)} /></label>
      </div>
      <label>Recargo (%)<input name="nightPercent" type="number" min="0" max="300" step="1" required defaultValue={settings.night_percent ?? 0} /></label>
      <button className="primary" disabled={busy}>Guardar tarifa nocturna</button>
    </form>
    {onSaved && <VehicleSettings settings={settings as unknown as VehicleSettings} busy={busy} onSaved={onSaved} />}
  </div>;
}

/** Comisión de De1na: interruptor general, porcentaje y a qué métodos de pago se aplica. */
export function CommissionSettings({ settings, busy }: { settings: Settings; busy: boolean }) {
  const client = useMemo(() => browserClient(), []);
  const [on, setOn] = useState(settings.commission_enabled !== false), [promo, setPromo] = useState(!!settings.commission_promo);
  const [saving, setSaving] = useState(false), [msg, setMsg] = useState(""), [err, setErr] = useState("");
  const methods: [string, string, boolean | undefined][] = [
    ["commission_on_pago_movil", "Pago móvil", settings.commission_on_pago_movil],
    ["commission_on_binance", "Binance Pay", settings.commission_on_binance],
    ["commission_on_wallet", "Saldo De1na", settings.commission_on_wallet],
    ["commission_on_cash", "Efectivo (se descuenta de sus ganancias)", settings.commission_on_cash ?? false],
  ];
  return <form className="trip-card commission-settings" onSubmit={async e => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = { commission_enabled: on, commission_promo: promo, commission_percent: Number(String(f.get("percent")).replace(",", ".")) };
    for (const [key] of methods) payload[key] = f.get(key) === "on";
    setSaving(true); setErr(""); setMsg("");
    const { error } = await client.rpc("admin_commission", { payload });
    setSaving(false);
    if (error) setErr(error.message === "Porcentaje inválido" ? "El porcentaje debe estar entre 0 y 100." : "No se pudo guardar."); else setMsg("Comisión guardada. Se aplica a los viajes que finalicen desde ahora.");
  }}>
    <h2>Comisión De1na</h2>
    <p className="muted">Porcentaje que De1na se queda de cada viaje. Se descuenta al acreditar las ganancias del conductor.</p>
    <label className="payment-switch"><input type="checkbox" role="switch" checked={on} onChange={e => setOn(e.target.checked)} disabled={saving || busy} /><span><strong>{on ? "Comisión activada" : "Comisión desactivada"}</strong><small>{on ? "Se aplica a los métodos marcados abajo." : "Los conductores reciben el precio completo de cada viaje."}</small></span></label>
    <fieldset className={"commission-fields" + (on ? "" : " is-off")} aria-disabled={!on} disabled={saving || busy}>
      <label>Comisión (%)<input name="percent" type="number" min="0" max="100" step="0.01" required defaultValue={Number(settings.commission_percent ?? 0)} /></label>
      <legend className="sr-only">Métodos de pago con comisión</legend>
      <p className="commission-label">Aplicar en viajes pagados con:</p>
      {methods.map(([key, label, value]) => <label key={key} className="check"><input name={key} type="checkbox" defaultChecked={value !== false} />{label}</label>)}
    </fieldset>
    <label className="payment-switch"><input type="checkbox" role="switch" checked={promo} onChange={e => setPromo(e.target.checked)} disabled={saving || busy} /><span><strong>Aviso «Sin comisión» a conductores</strong><small>{on ? "Se mostrará en Ganancias solo cuando la comisión esté desactivada." : promo ? "Los conductores ven en Ganancias que hoy no se cobra comisión." : "Actívalo para avisar a los conductores que no se cobra comisión."}</small></span></label>
    {err && <p className="payment-error" role="alert">{err}</p>}
    {msg && <p className="admin-create-notice" role="status">{msg}</p>}
    <button className="primary" disabled={saving || busy}>{saving ? "Guardando…" : "Guardar comisión"}</button>
  </form>;
}

type VehicleSettings = Record<string, unknown> & { moto_enabled?: boolean; car_enabled?: boolean; car_base_cents?: number; car_per_km_cents?: number | null; car_minimum_cents?: number; car_rounding_cents?: number;
  car_night_enabled?: boolean; car_night_start?: string; car_night_end?: string; car_night_percent?: number };

/** Servicios activos (moto / carro) y tarifas propias del carro, incluida su tarifa nocturna. */
export function VehicleSettings({ settings, busy, onSaved }: { settings: VehicleSettings; busy: boolean; onSaved: (text: string) => void }) {
  const client = useMemo(() => browserClient(), []);
  const [moto, setMoto] = useState(settings.moto_enabled !== false), [car, setCar] = useState(settings.car_enabled === true);
  const [saving, setSaving] = useState(""), [err, setErr] = useState(""), [errKind, setErrKind] = useState("");
  async function save(kind: string, payload: Record<string, unknown>, text: string) {
    setSaving(kind); setErr(""); setErrKind(kind);
    const { error } = await client.rpc("admin_vehicle_settings", { payload });
    setSaving("");
    if (error) setErr(error.message === "Activa al menos un servicio" ? "Debe quedar al menos un servicio activo." : "No se pudo guardar. Revisa los valores.");
    else onSaved(text);
  }
  const money = (form: FormData, key: string) => Math.round(Number(form.get(key)) * 100);
  const off = busy || !!saving;
  return <>
    <form className="trip-card vehicle-services" onSubmit={e => { e.preventDefault(); void save("services", { moto_enabled: moto, car_enabled: car }, "Servicios actualizados."); }}>
      <h2>Servicios activos</h2>
      <p className="muted">Los pasajeros solo ven los tipos activos al pedir un viaje. Útil para probar carros y apagarlos hasta tener conductores.</p>
      <label className="payment-switch"><input type="checkbox" role="switch" checked={moto} onChange={e => setMoto(e.target.checked)} /><span><strong>De1na Moto</strong><small>{moto ? "Activo" : "Desactivado"}</small></span></label>
      <label className="payment-switch"><input type="checkbox" role="switch" checked={car} onChange={e => setCar(e.target.checked)} /><span><strong>De1na Carro</strong><small>{car ? (settings.car_per_km_cents ? "Activo" : "Activo · define su precio por km") : "Desactivado"}</small></span></label>
      {err && errKind === "services" && <p className="payment-error" role="alert">{err}</p>}
      <button className="primary" disabled={off || (!moto && !car)}>{saving === "services" ? "Guardando…" : "Guardar servicios"}</button>
    </form>
    <form className="trip-card fare-settings" onSubmit={e => {
      e.preventDefault(); const f = new FormData(e.currentTarget);
      void save("fares", { car_base_cents: money(f, "base"), car_per_km_cents: money(f, "km"), car_minimum_cents: money(f, "minimum"), car_rounding_cents: Number(f.get("rounding")) }, "Tarifas de carro guardadas.");
    }}>
      <h2>Tarifas de carro · USD</h2>
      <p className="muted">Se calculan igual que las de moto, con sus propios valores.</p>
      <div className="two">
        <label>Tarifa base (USD)<input name="base" type="number" min="0" max="10000" step="0.01" required defaultValue={(settings.car_base_cents ?? 100) / 100} /></label>
        <label>Precio por km (USD)<input name="km" type="number" min="0.01" max="10000" step="0.01" required defaultValue={settings.car_per_km_cents ? settings.car_per_km_cents / 100 : ""} placeholder="Define el precio por km" /></label>
      </div>
      <label>Tarifa mínima (USD)<input name="minimum" type="number" min="0" max="10000" step="0.01" required defaultValue={(settings.car_minimum_cents ?? 200) / 100} /></label>
      <label>Redondeo de tarifa<select name="rounding" defaultValue={settings.car_rounding_cents ?? 50}><option value="50">Hacia arriba cada $0.50</option><option value="100">Hacia arriba cada $1.00</option><option value="1">Sin redondeo adicional</option></select></label>
      {err && errKind === "fares" && <p className="payment-error" role="alert">{err}</p>}
      <button className="primary" disabled={off}>{saving === "fares" ? "Guardando…" : "Guardar tarifas de carro"}</button>
    </form>
    <form className="trip-card night-fare" onSubmit={e => {
      e.preventDefault(); const f = new FormData(e.currentTarget);
      void save("night", { car_night_enabled: f.get("night") === "on", car_night_start: String(f.get("nightStart") || "20:00"), car_night_end: String(f.get("nightEnd") || "05:00"), car_night_percent: Math.round(Number(f.get("nightPercent")) || 0) }, "Tarifa nocturna de carro guardada.");
    }}>
      <h2>🌙 Tarifa nocturna de carro</h2>
      <p className="muted">Horario y recargo propios para los viajes en carro (hora de Venezuela).</p>
      <label className="check"><input name="night" type="checkbox" defaultChecked={!!settings.car_night_enabled} />Aplicar recargo nocturno</label>
      <div className="two">
        <label>Inicio<input name="nightStart" type="time" required defaultValue={(settings.car_night_start || "20:00").slice(0, 5)} /></label>
        <label>Cierre<input name="nightEnd" type="time" required defaultValue={(settings.car_night_end || "05:00").slice(0, 5)} /></label>
      </div>
      <label>Recargo (%)<input name="nightPercent" type="number" min="0" max="300" step="1" required defaultValue={settings.car_night_percent ?? 0} /></label>
      {err && errKind === "night" && <p className="payment-error" role="alert">{err}</p>}
      <button className="primary" disabled={off}>{saving === "night" ? "Guardando…" : "Guardar tarifa nocturna"}</button>
    </form>
  </>;
}
