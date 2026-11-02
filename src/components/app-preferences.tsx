"use client";
import { useEffect, useState } from "react";
import { readPref, writePref } from "@/lib/prefs";

/** Configuración de este dispositivo: sonido de avisos y, para conductores, pantalla encendida durante el viaje. */
export function AppPreferences({ driver }: { driver: boolean }) {
  const [sound, setSound] = useState(true), [awake, setAwake] = useState(true);
  useEffect(() => { setSound(readPref("sound")); setAwake(readPref("awake")); }, []);
  return <article className="trip-card app-preferences">
    <h2>Preferencias</h2>
    <label className="payment-switch"><input type="checkbox" role="switch" checked={sound} onChange={e => { setSound(e.target.checked); writePref("sound", e.target.checked); }} />
      <span><strong>Sonido de avisos</strong><small>{driver ? "Suena cuando llega una nueva solicitud de viaje." : "Suena cuando un conductor acepta tu viaje."}</small></span></label>
    {driver && <label className="payment-switch"><input type="checkbox" role="switch" checked={awake} onChange={e => { setAwake(e.target.checked); writePref("awake", e.target.checked); }} />
      <span><strong>Mantener la pantalla encendida</strong><small>Durante la navegación de un viaje la pantalla no se apaga.</small></span></label>}
  </article>;
}
