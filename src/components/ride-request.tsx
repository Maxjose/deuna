"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AppIcon } from "./app-icon";
import { destinationLabel, type MapPoint } from "@/lib/destination";
const DestinationMap = dynamic(() => import("./destination-map"), {
  ssr: false,
  loading: () => <p role="status">Abriendo mapa…</p>,
});
export function RideRequest({
  zones,
  enabled,
  busy,
  offline,
  onRequest,
}: {
  zones: string[];
  enabled: boolean;
  busy: boolean;
  offline: boolean;
  onRequest: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [destination, setDestination] = useState(""),
    [reference, setReference] = useState(""),
    [point, setPoint] = useState<MapPoint | null>(null),
    [mode, setMode] = useState<"text" | "map">("text"),
    [moto, setMoto] = useState(false),
    [editor, setEditor] = useState(false),
    [error, setError] = useState("");
  const sheet = useRef<HTMLDialogElement>(null),
    opener = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (editor) sheet.current?.showModal();
  }, [editor]);
  function confirmDestination() {
    try {
      const value = destinationLabel(reference, mode === "map" ? point : null);
      if (mode === "map" && !point)
        throw Error("Selecciona un punto en el mapa.");
      setDestination(value);
      setMoto(false);
      sheet.current?.close();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="ride-flow">
      <div
        className="flow-progress"
        aria-label={
          destination
            ? moto
              ? "Paso 3 de 3: solicitar"
              : "Paso 2 de 3: elegir moto"
            : "Paso 1 de 3: destino"
        }
      >
        <span className="complete" />
        <span className={destination ? "complete" : ""} />
        <span className={moto ? "complete" : ""} />
      </div>
      <button
        ref={opener}
        type="button"
        className={
          "destination-choice " + (destination ? "has-destination" : "")
        }
        onClick={() => {
          setError("");
          setEditor(true);
        }}
      >
        <span className="destination-symbol">
          <AppIcon name="ride" />
        </span>
        <span>
          <small>
            {destination ? "TU DESTINO" : "EMPECEMOS POR TU DESTINO"}
          </small>
          <strong>{destination || "¿A dónde quieres ir?"}</strong>
          <span className="muted">
            {destination
              ? "Toca para cambiarlo"
              : "Escribe una dirección o elige en el mapa"}
          </span>
        </span>
        <AppIcon name="arrow" />
      </button>
      {!destination ? (
        <div className="journey-intro">
          <div className="journey-bike">
            <AppIcon name="moto" />
          </div>
          <h2>Tu próxima vuelta empieza aquí.</h2>
          <p>
            Elige tu destino.
            <br />
            Nosotros te conectamos.
          </p>
        </div>
      ) : (
        <form
          className="trip-card service-step"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!moto || busy || offline || !enabled) return;
            const data = new FormData(e.currentTarget);
            await onRequest({
              origin: String(data.get("origin")).trim(),
              destination,
              zone: data.get("zone"),
            });
          }}
        >
          <h2>¿Cómo quieres ir?</h2>
          <button
            type="button"
            className={"moto-option " + (moto ? "is-selected" : "")}
            aria-pressed={moto}
            onClick={() => setMoto(true)}
          >
            <span className="service-icon">
              <AppIcon name="moto" />
            </span>
            <span>
              <strong>De1na Moto</strong>
              <small>Para ti · 1 pasajero</small>
            </span>
            <span className="selection-dot" aria-hidden="true" />
          </button>
          {moto && (
            <div className="pickup-step">
              <label>
                ¿Dónde te buscamos?
                <input
                  name="origin"
                  placeholder="Dirección y referencia de recogida"
                  required
                  maxLength={150}
                />
              </label>
              <label>
                Zona de destino
                <select name="zone" required defaultValue="">
                  <option value="">Selecciona una zona</option>
                  {zones.map((z) => (
                    <option key={z}>{z}</option>
                  ))}
                </select>
              </label>
              <button
                className="primary"
                disabled={busy || offline || !enabled}
              >
                {busy ? "Solicitando…" : "Solicitar viaje"}
                <AppIcon name="arrow" />
              </button>
              {!enabled && (
                <p className="muted service-closed">
                  Las solicitudes no están disponibles en este momento.
                </p>
              )}
            </div>
          )}
        </form>
      )}
      <dialog
        ref={sheet}
        className="destination-sheet"
        aria-labelledby="destination-title"
        onClose={() => {
          setEditor(false);
          opener.current?.focus();
        }}
      >
        <div className="destination-sheet-header">
          <h2 id="destination-title">¿A dónde quieres ir?</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Cerrar selección de destino"
            onClick={() => sheet.current?.close()}
          >
            ×
          </button>
        </div>
        <div className="destination-sheet-body">
          <div className="destination-tabs">
            <button
              className={mode === "text" ? "selected" : ""}
              type="button"
              onClick={() => {
                setMode("text");
                setError("");
              }}
            >
              Escribir dirección
            </button>
            <button
              className={mode === "map" ? "selected" : ""}
              type="button"
              onClick={() => {
                setMode("map");
                setError("");
              }}
            >
              Elegir en el mapa
            </button>
          </div>
          {editor && mode === "map" && (
            <DestinationMap point={point} onChange={setPoint} />
          )}
          <label>
            {mode === "map"
              ? "Dirección o referencia del punto"
              : "Dirección de destino"}
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={
                mode === "map"
                  ? "Ej. Frente a la plaza, entrada principal"
                  : "Ej. Calle, sector o lugar de referencia"
              }
              maxLength={110}
              autoFocus={mode === "text"}
            />
          </label>
          {error && (
            <p role="alert" className="notice">
              {error}
            </p>
          )}
        </div>
        <div className="destination-sheet-footer">
          <button
            type="button"
            className="primary"
            onClick={confirmDestination}
          >
            Confirmar destino
            <AppIcon name="arrow" />
          </button>
        </div>
      </dialog>
    </div>
  );
}
