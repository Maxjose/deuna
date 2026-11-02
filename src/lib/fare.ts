export type FareSettings = { base_cents: number; per_km_cents: number | null; minimum_cents: number; rounding_cents?:number; night_enabled?: boolean; night_start?: string; night_end?: string; night_percent?: number; commission_percent?: number | string; commission_on_cash?: boolean };
export type FareQuote = { quote: string; signature: string; fare_cents: number; night_percent?: number; distance_meters: number; duration_seconds: number; expires_at: number };
export function fareCents(meters: number, settings: FareSettings, at: Date = new Date()) {
  const rounding=settings.rounding_cents===undefined?1:settings.rounding_cents;
  if (!Number.isFinite(meters) || meters <= 0 || meters > 2000000 ||
      !Number.isSafeInteger(settings.base_cents) || settings.base_cents < 0 ||
      !Number.isSafeInteger(settings.minimum_cents) || settings.minimum_cents < 0 ||
      !Number.isSafeInteger(settings.per_km_cents) || !settings.per_km_cents || settings.per_km_cents < 0 || ![1,50,100].includes(rounding))
    throw Error("Tarifa no disponible");
  const surcharge=nightSurcharge(settings,at);
  const cents=Math.round(Math.max(1, settings.minimum_cents, settings.base_cents + Math.round(meters * settings.per_km_cents / 1000))*(100+surcharge)/100);
  return Math.ceil(cents/rounding)*rounding;
}
export function usd(cents: number) { return new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD' }).format(cents / 100); }

/** Minutos desde medianoche en hora de Venezuela. */
function caracasMinutes(at: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Caracas', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value);
  return get('hour') * 60 + get('minute');
}
const toMinutes = (time?: string) => { const [h, m] = (time || '').split(':').map(Number); return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN; };
/** Porcentaje de recargo nocturno vigente (0 si no aplica). Admite horarios que cruzan la medianoche. */
export function nightSurcharge(settings: FareSettings, at: Date = new Date()) {
  const pct = settings.night_percent ?? 0, start = toMinutes(settings.night_start), end = toMinutes(settings.night_end);
  if (!settings.night_enabled || !Number.isSafeInteger(pct) || pct <= 0 || pct > 300 || !Number.isFinite(start) || !Number.isFinite(end) || start === end) return 0;
  const now = caracasMinutes(at);
  return (start < end ? now >= start && now < end : now >= start || now < end) ? pct : 0;
}
