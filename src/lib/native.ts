"use client";
/**
 * Puente con la app Android nativa (WebView). La app expone `window.De1naNative` y responde
 * llamando a `window.__de1naNative.resolve(id, value)`.
 */
type Bridge = {
  startLiveTrip?(tripId: string): void;
  stopLiveTrip?(): void;
  startTracking(token: string, url: string, key: string): void;
  stopTracking(): void;
  requestPushToken(id: string): void;
  readClipboard(id: string): void;
  keepScreenOn(on: boolean): void;
  appVersion(): number;
  haptic?(): void;
  deviceId?(): string;
  checkPlayUpdate?(id: string): void;
  startPlayUpdate?(): void;
};
declare global { interface Window { De1naNative?: Bridge; __de1naNative?: { resolve: (id: string, value: string | null) => void } } }

export const nativeBridge = (): Bridge | null => (typeof window !== 'undefined' && window.De1naNative) || null;
export const isNativeApp = () => !!nativeBridge();

const pending = new Map<string, (value: string | null) => void>();
function call(method: 'requestPushToken' | 'readClipboard' | 'checkPlayUpdate', timeoutMs = 20000, ...args: string[]) {
  const bridge = nativeBridge();
  if (!bridge) return Promise.resolve(null);
  if (!window.__de1naNative) window.__de1naNative = { resolve: (id, value) => { pending.get(id)?.(value); pending.delete(id); } };
  const id = Math.random().toString(36).slice(2);
  return new Promise<string | null>((resolve) => {
    pending.set(id, resolve);
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); resolve(null); } }, timeoutMs);
    (bridge[method] as (...a: string[]) => void)(id, ...args);
  });
}

/** Token de FCM del dispositivo (pide permiso de notificaciones si hace falta). */
export async function nativePushEndpoint() {
  const token = await call('requestPushToken');
  return token ? `fcm:${token}` : null;
}

/** Lee el portapapeles: en la app nativa por el puente; en la web con la API del navegador. */
export async function readClipboardText() {
  if (isNativeApp()) {
    const text = await call('readClipboard', 5000);
    if (text == null) throw new Error('clipboard');
    return text;
  }
  return navigator.clipboard.readText();
}

/** App nativa: versionCode disponible en Google Play (null si no hay actualización o no aplica). */
export async function playUpdateVersion() {
  if (!nativeBridge()?.checkPlayUpdate) return null;
  const value = await call('checkPlayUpdate', 15000);
  const code = Number(value);
  return Number.isInteger(code) && code > 0 ? code : null;
}

/** App nativa: abre la actualización de Google Play (o la ficha de la tienda). */
export function startPlayUpdate() { nativeBridge()?.startPlayUpdate?.(); }

/** Identificador del teléfono (solo en la app nativa). */
export function nativeDeviceId() { try { return nativeBridge()?.deviceId?.() || null; } catch { return null; } }
