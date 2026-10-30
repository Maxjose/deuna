import type { MapPoint } from "./destination";
export type Place = { label: string; point: MapPoint | null };
export function mergeSearchPlaces(catalog:Place[],external:Place[]) {
  const merged:Place[]=[];
  const key=(label:string)=>label.split(',')[0].normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
  for(const place of [...catalog,...external]){
    if(!place.point||!validPoint(place.point))continue;
    if(merged.some(existing=>existing.point&&key(existing.label)===key(place.label)&&
      Math.hypot((existing.point.lat-place.point!.lat)*111320,(existing.point.lng-place.point!.lng)*111320*Math.cos(place.point!.lat*Math.PI/180))<100))continue;
    merged.push(place);if(merged.length===8)break;
  }
  return merged;
}
export function validPoint(p: MapPoint) {
  return (
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180
  );
}
export function parseStoredPlace(label: string): Place {
  const match = label.match(
    /^(.*?) · \((-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?)\)$/,
  );
  if (!match) return { label, point: null };
  const point = { lat: Number(match[2]), lng: Number(match[3]) };
  return { label: match[1], point: validPoint(point) ? point : null };
}
export function decodeRoute(body: unknown): [number, number][] {
  const data = body as {
    code?: string;
    routes?: { geometry?: { coordinates?: unknown[] } }[];
  };
  const coordinates = data?.routes?.[0]?.geometry?.coordinates;
  if (
    data?.code !== "Ok" ||
    !Array.isArray(coordinates) ||
    coordinates.length < 2 ||
    coordinates.length > 30000
  )
    throw Error("No se encontró una ruta por carretera.");
  return coordinates.map((c) => {
    if (!Array.isArray(c) || c.length < 2 || typeof c[0]!=='number' || typeof c[1]!=='number') throw Error("Ruta inválida");
    const point = { lat: Number(c[1]), lng: Number(c[0]) };
    if (!validPoint(point)) throw Error("Ruta inválida");
    return [point.lat, point.lng];
  });
}
export function decodePlaces(body: unknown): Place[] {
  const features = (body as { features?: unknown[] })?.features;
  if (!Array.isArray(features)) return [];
  return features.slice(0, 6).flatMap((f) => {
    if(!f||typeof f!=='object')return [];
    const value = f as {
      geometry?: { coordinates?: number[] };
      properties?: Record<string, unknown>;
    };
    const c = value.geometry?.coordinates,
      p = value.properties;
    if (!c || !p || typeof c[0]!=='number' || typeof c[1]!=='number') return [];
    const point = { lat: c[1], lng: c[0] };
    if (!validPoint(point)) return [];
    const text = (key: string) => typeof p[key] === "string" ? p[key] : "";
    const label = [
      text("name"),
      [text("street"), text("housenumber")].filter(Boolean).join(" "),
      text("city") || text("town") || text("village"),
      text("state"),
    ]
      .filter((v, i, a) => v && a.indexOf(v) === i)
      .join(", ")
      .slice(0, 110);
    return label ? [{ label, point }] : [];
  });
}

// Search envelope for Zulia; this is not a trip coverage geofence.
const bounds = { west: -73.5, south: 8.3, east: -70.5, north: 12.6 };
const fallback = { lat: 11.087, lng: -71.603 };
function inRegion(p: MapPoint) {
  return validPoint(p) && p.lng >= bounds.west && p.lng <= bounds.east && p.lat >= bounds.south && p.lat <= bounds.north;
}
export function searchCenter(point: MapPoint | null) { return point && inRegion(point) ? point : fallback; }
export function placeSearchUrl(base: string, query: string, point: MapPoint | null) {
  const center = searchCenter(point), url = new URL(base);
  url.searchParams.set('q', query);
  url.searchParams.set('lat', String(center.lat));
  url.searchParams.set('lon', String(center.lng));
  url.searchParams.set('bbox', `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`);
  url.searchParams.set('countrycode', 'VE');
  url.searchParams.set('location_bias_scale', '0.1');
  url.searchParams.set('zoom', '12');
  url.searchParams.set('limit', '12');
  return url;
}
export function localPlaces(body: unknown, point: MapPoint | null) {
  const features = (body as { features?: unknown[] })?.features;
  if (!Array.isArray(features)) return [];
  const center = searchCenter(point);
  const places = features.flatMap(feature => {
    const props = (feature as { properties?: { countrycode?: unknown; state?: unknown } } | null)?.properties;
    if (typeof props?.countrycode !== 'string' || props.countrycode.toUpperCase() !== 'VE') return [];
    if (typeof props.state === 'string' && !props.state.toLowerCase().includes('zulia')) return [];
    return decodePlaces({ features: [feature] }).filter(place => place.point && inRegion(place.point));
  });
  const distance = (p: MapPoint) => (p.lat-center.lat)**2 + ((p.lng-center.lng)*Math.cos(center.lat*Math.PI/180))**2;
  return places.sort((a,b) => distance(a.point!) - distance(b.point!)).slice(0,6);
}
