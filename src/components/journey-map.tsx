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
  navigation = false,
  livePosition,
  follow = false,
  extraPoint,
}: {
  origin: MapPoint | null;
  destination: MapPoint | null;
  picking?: boolean;
  onPick?: (p: MapPoint) => void;
  onRoute?: (ready: boolean) => void;
  quotePlaces?: { origin: Place; destination: Place };
  onQuote?: (quote: FareQuote | null) => void;
  navigation?: boolean;
  livePosition?: (MapPoint & {accuracy:number}) | null;
  follow?: boolean;
  extraPoint?: MapPoint|null;
}) {
  const container = useRef<HTMLDivElement>(null),
    mapRef = useRef<import("leaflet").Map | null>(null),
    callbacks = useRef({ onPick, onRoute, onQuote });
  const [library, setLibrary] = useState<typeof import("leaflet") | null>(null),
    [message, setMessage] = useState(""),
    [retry, setRetry] = useState(0);
  callbacks.current = { onPick, onRoute, onQuote };
  const cameraFollow=useRef(follow);
  cameraFollow.current=follow;
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
    const mark = (p: MapPoint, kind: "origin" | "destination") =>
      L.marker([p.lat, p.lng], {
        icon: L.divIcon({
          className: "journey-marker",
          html: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">${kind === "origin" ? '<circle cx="12" cy="8" r="3"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>' : '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>'}</svg>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        }),
        title: kind === "origin" ? "Tu punto de recogida" : "Destino del viaje",
        alt: kind === "origin" ? "Tu punto de recogida" : "Destino del viaje",
      }).addTo(layer);
    if (origin && !navigation) mark(origin, "origin");
    if (destination) mark(destination, "destination");
    if(extraPoint)L.circleMarker([extraPoint.lat,extraPoint.lng],{radius:7,color:'#122033',weight:2,fillColor:'#b4f36a',fillOpacity:1}).bindTooltip('Destino del pasajero').addTo(layer);
    const points = [origin, destination, extraPoint].filter(Boolean) as MapPoint[];
    if (points.length === 1 && (!navigation || !cameraFollow.current || !origin)) map.setView([points[0].lat, points[0].lng], 15);
    else if (points.length >= 2 && (!navigation || !cameraFollow.current || !origin))
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
          if (!navigation || !cameraFollow.current) map.fitBounds(line.getBounds(), { padding: [45, 60] });
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
  }, [origin, destination, picking, library, retry, quotePlaces, navigation,extraPoint]);
  useEffect(()=>{
    const map=mapRef.current,L=library;
    if(!map||!L||!livePosition)return;
    const position:[number,number]=[livePosition.lat,livePosition.lng];
    const layer=L.layerGroup().addTo(map);
    L.circle(position,{radius:livePosition.accuracy,color:'#2876e8',weight:1,fillOpacity:.08,interactive:false}).addTo(layer);
    L.circleMarker(position,{radius:9,color:'white',weight:3,fillColor:'#2876e8',fillOpacity:1}).bindTooltip('Tu ubicación actual').addTo(layer);
    if(follow)map.setView(position,Math.max(16,map.getZoom()),{animate:false});
    return()=>{layer.remove();};
  },[livePosition,follow,library]);
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
        <svg className="map-center-cross" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>
      )}
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
