"use client";
import { useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { parseStoredPlace } from "@/lib/journey";
import { AppIcon } from "./app-icon";
const JourneyMap = dynamic(() => import("./journey-map"), { ssr: false });
export function RideWaiting({
  origin,
  destination,
  busy,
  onCancel,
}: {
  origin: string;
  destination: string;
  busy: boolean;
  onCancel: () => void;
}) {
  const sheet = useRef<HTMLDialogElement>(null),
    from = useMemo(() => parseStoredPlace(origin), [origin]),
    to = useMemo(() => parseStoredPlace(destination), [destination]);
  useEffect(() => {
    sheet.current?.showModal();
  }, []);
  return (
    <dialog
      ref={sheet}
      className="journey-flow-screen"
      aria-label="Conectando con un motorizado"
      onCancel={(e) => e.preventDefault()}
    >
      <div className="journey-map-top">
        <span className="connecting-brand">
          De<span>1</span>na
        </span>
      </div>
      <JourneyMap origin={from.point} destination={to.point} />
      <section className="journey-bottom-sheet waiting-sheet">
        <div className="sheet-handle" />
        <h2>Conectando con tu motorizado</h2>
        <p role="status">Estamos buscando quién te lleve.</p>
        <div className="connecting-progress" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="waiting-moto">
          <AppIcon name="moto" />
        </div>
        <div className="waiting-destination">
          <small>VAS A</small>
          <strong>{to.label}</strong>
        </div>
        <button className="secondary" disabled={busy} onClick={onCancel}>
          Cancelar solicitud
        </button>
      </section>
    </dialog>
  );
}
