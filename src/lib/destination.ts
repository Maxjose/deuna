export type MapPoint = { lat: number; lng: number };
export function destinationLabel(
  reference: string,
  point: MapPoint | null = null,
) {
  const label = reference.trim();
  if (!label || label.length > 110)
    throw Error("Escribe una dirección o referencia de hasta 110 caracteres.");
  if (!point) return label;
  if (
    !Number.isFinite(point.lat) ||
    !Number.isFinite(point.lng) ||
    Math.abs(point.lat) > 90 ||
    Math.abs(point.lng) > 180
  )
    throw Error("El punto seleccionado no es válido.");
  return `${label} · (${point.lat.toFixed(5)}, ${point.lng.toFixed(5)})`;
}
