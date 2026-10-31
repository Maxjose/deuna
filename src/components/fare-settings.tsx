"use client";
import type { FareSettings as Settings } from '@/lib/fare';
export function FareSettings({ settings, busy, onSave }: { settings: Settings; busy: boolean; onSave: (payload: Record<string, unknown>) => void }) {
  return <form className="trip-card fare-settings" onSubmit={e => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    onSave({ base_cents: Math.round(Number(form.get('base')) * 100), per_km_cents: Math.round(Number(form.get('km')) * 100), minimum_cents: Math.round(Number(form.get('minimum')) * 100),rounding_cents:Number(form.get('rounding')) });
  }}>
    <h2>Tarifas de Moto · USD</h2>
    <p className="muted">Precio: base + kilómetros por carretera × precio por km. Se aplica la tarifa mínima cuando el cálculo es menor.</p>
    <label>Tarifa base (USD)<input name="base" type="number" min="0" max="10000" step="0.01" required defaultValue={settings.base_cents / 100} /></label>
    <label>Precio por kilómetro (USD)<input name="km" type="number" min="0.01" max="10000" step="0.01" required defaultValue={settings.per_km_cents ? settings.per_km_cents / 100 : ''} placeholder="Define el precio por km" /></label>
    <label>Tarifa mínima (USD)<input name="minimum" type="number" min="0" max="10000" step="0.01" required defaultValue={settings.minimum_cents / 100} /></label>
    <label>Redondeo de tarifa<select name="rounding" defaultValue={settings.rounding_cents??50}><option value="50">Hacia arriba cada $0.50</option><option value="100">Hacia arriba cada $1.00</option><option value="1">Sin redondeo adicional</option></select></label>
    <p className="muted">Se aplica después de calcular la tarifa y respetar el mínimo. Cada $0.50: $1.20 pasa a $1.50 y $1.80 pasa a $2.00.</p>
    <p className="muted">Los precios confirmados no cambian al actualizar las tarifas. Las cotizaciones duran cinco minutos.</p>
    <button className="primary" disabled={busy}>Guardar tarifas</button>
  </form>;
}
