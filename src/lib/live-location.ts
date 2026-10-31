import type { MapPoint } from './destination';
import type { NavigationFix } from './navigation';

export type SharedFix = NavigationFix & { heading?: number | null; speed?: number | null };
export type LiveLocation = {
  trip_id: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  heading: number | null;
  speed: number | null;
  recorded_at: string;
};
export type Freshness = 'live' | 'stale' | 'lost';

/** Envío mínimo cada 4 s si hay movimiento, y un latido cada 15 s aunque esté detenido. */
export const SHARE_MIN_INTERVAL = 4000;
export const SHARE_HEARTBEAT = 15000;
export const SHARE_MIN_DISTANCE = 10;

export function distanceMeters(a: MapPoint, b: MapPoint) {
  const radians = Math.PI / 180,
    lat = (b.lat - a.lat) * radians,
    lng = (b.lng - a.lng) * radians;
  const h = Math.sin(lat / 2) ** 2 + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(lng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

export function shouldShareFix(previous: { point: MapPoint; at: number } | null, next: MapPoint, now: number) {
  if (!previous) return true;
  const elapsed = now - previous.at;
  if (elapsed >= SHARE_HEARTBEAT) return true;
  return elapsed >= SHARE_MIN_INTERVAL && distanceMeters(previous.point, next) >= SHARE_MIN_DISTANCE;
}

/** Convierte una posición del navegador en los parámetros de share_location, descartando valores no válidos. */
export function shareParams(tripId: string, fix: SharedFix) {
  const heading = fix.heading != null && Number.isFinite(fix.heading) && fix.heading >= 0 && fix.heading < 360 ? fix.heading : null;
  const speed = fix.speed != null && Number.isFinite(fix.speed) && fix.speed >= 0 && fix.speed <= 100 ? fix.speed : null;
  return {
    trip_id: tripId,
    latitude: fix.lat,
    longitude: fix.lng,
    accuracy: Math.round(fix.accuracy * 10) / 10,
    heading,
    speed,
    recorded_at: new Date(fix.timestamp).toISOString(),
  };
}

export function locationFreshness(recordedAt: string, now: number): Freshness {
  const age = now - Date.parse(recordedAt);
  if (!Number.isFinite(age) || age > 120000) return 'lost';
  return age > 30000 ? 'stale' : 'live';
}

export function ageLabel(recordedAt: string, now: number) {
  const seconds = Math.max(0, Math.round((now - Date.parse(recordedAt)) / 1000));
  if (!Number.isFinite(seconds)) return '';
  if (seconds < 10) return 'ahora mismo';
  if (seconds < 60) return `hace ${seconds} s`;
  const minutes = Math.round(seconds / 60);
  return `hace ${minutes} min`;
}

/** Tiempo estimado a la velocidad típica de una moto en ciudad (25 km/h), redondeado hacia arriba. */
export function etaMinutes(from: MapPoint, to: MapPoint) {
  const meters = distanceMeters(from, to) * 1.3;
  return Math.max(1, Math.ceil(meters / (25000 / 60)));
}

/** Posición aceptable para compartir: más tolerante que la navegación (interiores, GPS frío). */
export function shareableFix(fix: SharedFix, now: number) {
  return Number.isFinite(fix.lat) && Math.abs(fix.lat) <= 90 && Number.isFinite(fix.lng) && Math.abs(fix.lng) <= 180
    && Number.isFinite(fix.accuracy) && fix.accuracy >= 0 && fix.accuracy <= 1000
    && Number.isFinite(fix.timestamp) && now - fix.timestamp <= 60000 && fix.timestamp <= now + 30000;
}
