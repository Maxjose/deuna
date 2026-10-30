"use client";
import { useEffect, useRef, useState } from "react";
import type { MapPoint } from "@/lib/destination";
import { decodeRoute } from "@/lib/journey";
import type { Place } from "@/lib/journey";
import type { FareQuote } from "@/lib/fare";
import "leaflet/dist/leaflet.css";
export default function JourneyMap({
  origin,
  destination,
  picking,
  onPick,
  onRoute,
  quotePlaces,
  onQuote,
}: {
  origin: MapPoint | null;
  destination: MapPoint | null;
  picking?: boolean;
  onPick?: (p: MapPoint) => void;
  onRoute?: (ready: boolean) => void;
  quotePlaces?: { origin: Place; destination: Place };
  onQuote?: (quote: FareQuote | null) => void;
}) {
  const container = useRef<HTMLDivElement>(null),
    mapRef = useRef<import("leaflet").Map | null>(null),
    callbacks = useRef({ onPick, onRoute, onQuote });
  const [library, setLibrary] = useState<typeof import("leaflet") | null>(null),
    [message, setMessage] = useState(""),
    [retry, setRetry] = useState(0);
  callbacks.current = { onPick, onRoute, onQuote };
  useEffect(() => {
    let alive = true;
    void import("leaflet")
      .then((L) => {
        if (!alive || !container.current) return;
        const map = L.map(container.current, { zoomControl: false }).setView(
          [11.087, -71.603],
          14,
        );
        mapRef.current = map;
        L.control.zoom({ position: "topright" }).addTo(map);
        L.tileLayer(
          process.env.NEXT_PUBLIC_MAP_TILES_URL ||
            "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
          {
            maxZoom: 19,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          },
        )
          .addTo(map)
          .on("tileerror", () => {
            if (alive) setMessage("Algunas calles no pudieron cargarse.");
          });
        setLibrary(L);
        requestAnimationFrame(() => map.invalidateSize());
      })
      .catch(() => setMessage("No se pudo abrir el mapa."));
    return () => {
      alive = false;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);
  useEffect(() => {
    const map = mapRef.current,
      L = library;
    if (!map || !L) return;
    const layer = L.layerGroup().addTo(map);
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 15000);
    callbacks.current.onRoute?.(false);
    callbacks.current.onQuote?.(null);
    setMessage("");
    const mark = (p: MapPoint, text: string) =>
      L.marker([p.lat, p.lng], {
        icon: L.divIcon({
          className: "journey-marker",
          html: `<span>${text}</span>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        }),
      }).addTo(layer);
    if (origin) mark(origin, "A");
    if (destination) mark(destination, "B");
    const points = [origin, destination].filter(Boolean) as MapPoint[];
    if (points.length === 1) map.setView([points[0].lat, points[0].lng], 15);
    else if (points.length === 2)
      map.fitBounds(
        points.map((p) => [p.lat, p.lng] as [number, number]),
        { padding: [55, 70], maxZoom: 16 },
      );
    const clicked = (e: import("leaflet").LeafletMouseEvent) =>
      callbacks.current.onPick?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    if (picking) map.on("click", clicked);
    if (origin && destination && !picking) {
      setMessage("Trazando tu ruta…");
      const base =
        process.env.NEXT_PUBLIC_ROUTING_URL ||
        "https://router.project-osrm.org";
      const coordinates = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
      fetch(
        quotePlaces ? '/api/quote' : `${base}/route/v1/driving/${coordinates}?overview=full&geometries=geojson&radiuses=250;250`,
        { signal: controller.signal, ...(quotePlaces ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(quotePlaces) } : {}) },
      )
        .then(async (r) => {
          const body = await r.json();
          if (!r.ok) throw Error(body.error || 'No pudimos trazar la ruta.');
          if (quotePlaces) {
            if (!active) return null;
            callbacks.current.onQuote?.(body);
            return body.geometry as [number, number][];
          }
          return decodeRoute(body);
        })
        .then((route) => {
          if (!active || !route) return;
          L.polyline(route, { color: "#fff", weight: 9, opacity: 0.95 }).addTo(
            layer,
          );
          const line = L.polyline(route, { color: "#122033", weight: 5 }).addTo(
            layer,
          );
          map.fitBounds(line.getBounds(), { padding: [45, 60] });
          callbacks.current.onRoute?.(true);
          setMessage("Ruta de referencia");
        })
        .catch((error) => {
          if (active)
            setMessage(
              error instanceof Error && error.message.includes('tarifas') ? error.message : "No pudimos trazar la ruta. Revisa los puntos o vuelve a intentar.",
            );
        })
        .finally(() => clearTimeout(timeout));
    } else clearTimeout(timeout);
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timeout);
      map.off("click", clicked);
      layer.remove();
    };
  }, [origin, destination, picking, library, retry, quotePlaces]);
  return (
    <div className="journey-map">
      <div
        ref={container}
        className="journey-map-canvas"
        aria-label={
          picking
            ? "Mapa para fijar ubicación"
            : "Mapa de recogida, destino y ruta"
        }
      />
      {picking && (
        <button
          type="button"
          className="map-pick-center"
          onClick={() => {
            const p = mapRef.current?.getCenter();
            if (p) callbacks.current.onPick?.({ lat: p.lat, lng: p.lng });
          }}
        >
          Usar el centro del mapa
        </button>
      )}
      {message && (
        <div className="map-feedback" role="status">
          {message}
          {message !== 'Ruta de referencia' && message !== 'Trazando tu ruta…' && (
            <button onClick={() => setRetry((n) => n + 1)}>Reintentar</button>
          )}
        </div>
      )}
    </div>
  );
}
