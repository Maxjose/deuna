import { createHmac, randomUUID } from 'node:crypto';
import { serverClient } from '@/lib/supabase/server';
import { validPoint, decodeRoute, type Place } from '@/lib/journey';
import { destinationLabel } from '@/lib/destination';
import { fareCents, nightSurcharge, vehicleFare, type VehicleType } from '@/lib/fare';
const headers = { 'Cache-Control': 'private, no-store' };
export async function POST(request: Request) {
  const client = await serverClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return Response.json({ error: 'Inicia sesión para calcular el viaje.' }, { status: 401, headers });
  if (Number(request.headers.get('content-length')) > 4096) return new Response(null, { status: 413 });
  try {
    const text = await request.text();
    if (text.length > 4096) throw Error();
    const { origin, destination } = JSON.parse(text) as { origin: Place; destination: Place };
    if (!origin?.point || !destination?.point || !validPoint(origin.point) || !validPoint(destination.point) ||
        typeof origin.label !== 'string' || typeof destination.label !== 'string' || origin.label.length > 110 || destination.label.length > 110)
      return Response.json({ error: 'Confirma el punto de encuentro y el destino.' }, { status: 400, headers });
    const { data: settings } = await client.from('service_settings').select('base_cents,per_km_cents,minimum_cents,rounding_cents,night_enabled,night_start,night_end,night_percent,moto_enabled,car_enabled,car_base_cents,car_per_km_cents,car_minimum_cents,car_rounding_cents,car_night_enabled,car_night_start,car_night_end,car_night_percent').eq('id', 1).single();
    // Tipos activos con tarifa configurada (moto primero).
    const kinds = (['moto', 'car'] as VehicleType[]).filter(k => (k === 'moto' ? settings?.moto_enabled !== false : settings?.car_enabled === true) && vehicleFare(settings ?? {}, k).per_km_cents);
    if (!settings || !kinds.length) return Response.json({ error: 'Las tarifas todavía no están configuradas.' }, { status: 409, headers });
    const secret = process.env.FARE_SIGNING_KEY;
    if (!secret) throw Error();
    const from = origin.point, to = destination.point;
    const base = process.env.ROUTING_URL || 'https://router.project-osrm.org';
    const response = await fetch(`${base}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&radiuses=250;250`, { signal: AbortSignal.timeout(12000), cache: 'no-store' });
    if (!response.ok) throw Error();
    const body = await response.json();
    const geometry = decodeRoute(body);
    const route = body.routes[0];
    if (typeof route.distance !== 'number' || typeof route.duration !== 'number' || !Number.isFinite(route.duration) || route.duration < 0) throw Error();
    const meters = Math.round(route.distance), seconds = Math.round(route.duration);
    const now = new Date(), expires = Math.floor(Date.now() / 1000) + 300;
    const originLabel = destinationLabel(origin.label, from), destination_ = destinationLabel(destination.label, to);
    // Una cotización firmada por tipo de vehículo, con la misma ruta.
    const options = Object.fromEntries(kinds.map(kind => {
      const fares = vehicleFare(settings, kind), cents = fareCents(meters, fares, now), night = nightSurcharge(fares, now);
      const quote = JSON.stringify({ id: randomUUID(), user_id: user.id, origin: originLabel, destination: destination_, distance_meters: meters, duration_seconds: seconds, fare_cents: cents, currency: 'USD', expires_at: expires, vehicle_type: kind });
      return [kind, { quote, signature: createHmac('sha256', secret).update(quote).digest('hex'), fare_cents: cents, night_percent: night, distance_meters: meters, duration_seconds: seconds, expires_at: expires, vehicle_type: kind }];
    }));
    return Response.json({ geometry, ...options[kinds[0]], options }, { headers });
  } catch {
    return Response.json({ error: 'No pudimos calcular el recorrido y su precio. Vuelve a intentar.' }, { status: 503, headers });
  }
}
