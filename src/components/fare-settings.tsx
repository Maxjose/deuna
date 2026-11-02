"use client";
import type { FareSettings as Settings } from '@/lib/fare';

/** Tarifas de moto y tarifa nocturna, en recuadros separados (cada uno se guarda por su cuenta). */
export function FareSettings({ settings, busy, onSave }: { settings: Settings; busy: boolean; onSave: (payload: Record<string, unknown>) => void }) {
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
      <h2>🌙 Tarifa nocturna</h2>
      <p className="muted">Durante este horario (hora de Venezuela) el precio del viaje sube el porcentaje indicado, antes del redondeo. Puede cruzar la medianoche, por ejemplo de 20:00 a 05:00.</p>
      <label className="check"><input name="night" type="checkbox" defaultChecked={!!settings.night_enabled} />Aplicar recargo nocturno</label>
      <div className="two">
        <label>Inicio<input name="nightStart" type="time" required defaultValue={(settings.night_start || '20:00').slice(0, 5)} /></label>
        <label>Cierre<input name="nightEnd" type="time" required defaultValue={(settings.night_end || '05:00').slice(0, 5)} /></label>
      </div>
      <label>Recargo (%)<input name="nightPercent" type="number" min="0" max="300" step="1" required defaultValue={settings.night_percent ?? 0} /></label>
      <button className="primary" disabled={busy}>Guardar tarifa nocturna</button>
    </form>
  </div>;
}
