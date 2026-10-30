"use client";
import { useEffect, useRef, useState } from "react";
import type { MapPoint } from "@/lib/destination";
import "leaflet/dist/leaflet.css";
export default function DestinationMap({
  point,
  onChange,
}: {
  point: MapPoint | null;
  onChange: (point: MapPoint) => void;
}) {
  const container = useRef<HTMLDivElement>(null),
    listener = useRef(onChange),
    initial = useRef(point);
  const [error, setError] = useState("");
  useEffect(() => {
    listener.current = onChange;
  }, [onChange]);
  useEffect(() => {
    let alive = true;
    let map: import("leaflet").Map | undefined;
    void import("leaflet")
      .then((L) => {
        if (!alive || !container.current) return;
        map = L.map(container.current, { zoomControl: true }).setView(
          initial.current
            ? [initial.current.lat, initial.current.lng]
            : [11.087, -71.603],
          14,
        );
        const tiles = L.tileLayer(
          process.env.NEXT_PUBLIC_MAP_TILES_URL ||
            "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
          {
            maxZoom: 19,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          },
        ).addTo(map);
        tiles.on("tileerror", () => {
          if (alive)
            setError(
              "No se pudo cargar una parte del mapa. Puedes escribir la dirección.",
            );
        });
        const marker = L.circleMarker(
          initial.current
            ? [initial.current.lat, initial.current.lng]
            : [11.087, -71.603],
          {
            radius: 9,
            color: "#122033",
            weight: 3,
            fillColor: "#b4f36a",
            fillOpacity: 1,
          },
        );
        if (initial.current) marker.addTo(map);
        map.on("click", (e) => {
          marker.setLatLng(e.latlng).addTo(map!);
          listener.current({ lat: e.latlng.lat, lng: e.latlng.lng });
        });
        container.current.addEventListener("de1na-pick-center", () => {
          if (map) {
            const center = map.getCenter();
            marker.setLatLng(center).addTo(map);
            listener.current({ lat: center.lat, lng: center.lng });
          }
        });
        requestAnimationFrame(() => map?.invalidateSize());
      })
      .catch(() =>
        setError("No se pudo abrir el mapa. Puedes escribir la dirección."),
      );
    return () => {
      alive = false;
      map?.remove();
    };
  }, []);
  return (
    <div className="destination-map">
      <p className="muted">
        Toca tu destino en el mapa o muévelo y usa el punto central.
      </p>
      <div
        className="map-canvas"
        ref={container}
        aria-label="Mapa para elegir el destino"
      />
      <button
        type="button"
        className="secondary map-center"
        onClick={() =>
          container.current?.dispatchEvent(new Event("de1na-pick-center"))
        }
      >
        Elegir el centro del mapa
      </button>
      {point && (
        <small role="status">
          Punto fijado: {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
        </small>
      )}
      {error && <p role="status">{error}</p>}
    </div>
  );
}
