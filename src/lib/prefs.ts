"use client";
/** Preferencias de este dispositivo (Configuración): sonido de avisos y pantalla encendida en viajes. */
export type PrefKey = 'sound' | 'awake';
const KEY = (k: PrefKey) => `de1na-pref-${k}`;
export function readPref(key: PrefKey, fallback = true) {
  try { const v = localStorage.getItem(KEY(key)); return v == null ? fallback : v === '1'; } catch { return fallback; }
}
export function writePref(key: PrefKey, value: boolean) {
  try { localStorage.setItem(KEY(key), value ? '1' : '0'); } catch { /* sin almacenamiento */ }
}
