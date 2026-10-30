export type FareSettings = { base_cents: number; per_km_cents: number | null; minimum_cents: number };
export type FareQuote = { quote: string; signature: string; fare_cents: number; distance_meters: number; duration_seconds: number; expires_at: number };
export function fareCents(meters: number, settings: FareSettings) {
  if (!Number.isFinite(meters) || meters <= 0 || meters > 2000000 ||
      !Number.isSafeInteger(settings.base_cents) || settings.base_cents < 0 ||
      !Number.isSafeInteger(settings.minimum_cents) || settings.minimum_cents < 0 ||
      !Number.isSafeInteger(settings.per_km_cents) || !settings.per_km_cents || settings.per_km_cents < 0)
    throw Error("Tarifa no disponible");
  return Math.max(1, settings.minimum_cents, settings.base_cents + Math.round(meters * settings.per_km_cents / 1000));
}
export function usd(cents: number) { return new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD' }).format(cents / 100); }
