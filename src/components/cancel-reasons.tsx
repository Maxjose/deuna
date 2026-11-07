"use client";
import { useState } from "react";

const DRIVER = ["El pasajero no aparece", "Dirección incorrecta", "Problema con el vehículo", "Emergencia personal"];
const PASSENGER = ["Ya no lo necesito", "El conductor tarda mucho", "Pedí por error", "Cambié de destino"];

/** Motivo obligatorio de cancelación: opciones rápidas y «Otro» con texto. Devuelve el texto elegido (o "" si falta). */
export function CancelReasons({ who, onChange, disabled }: { who: "driver" | "passenger"; onChange: (reason: string) => void; disabled?: boolean }) {
  const [choice, setChoice] = useState(""), [other, setOther] = useState("");
  const options = who === "driver" ? DRIVER : PASSENGER;
  const pick = (value: string, text = other) => { setChoice(value); onChange(value === "other" ? text.trim() : value); };
  return <fieldset className="cancel-reasons" disabled={disabled}>
    <legend>¿Por qué cancelas?</legend>
    <div className="cancel-reason-chips">
      {options.map(o => <button key={o} type="button" aria-pressed={choice === o} onClick={() => pick(o)}>{o}</button>)}
      <button type="button" aria-pressed={choice === "other"} onClick={() => pick("other")}>Otro motivo</button>
    </div>
    {choice === "other" && <textarea rows={2} maxLength={200} placeholder="Cuéntanos brevemente el motivo" value={other} onChange={e => { setOther(e.target.value); pick("other", e.target.value); }} />}
  </fieldset>;
}
