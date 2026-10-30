import type { MapPoint } from "./destination";
export type Place = { label: string; point: MapPoint | null };
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
