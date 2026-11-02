"use client";
/**
 * Puente con la app Android nativa (WebView). La app expone `window.De1naNative` y responde
 * llamando a `window.__de1naNative.resolve(id, value)`.
 */
type Bridge = {
  startTracking(token: string, url: string, key: string): void;
  stopTracking(): void;
  requestPushToken(id: string): void;
  readClipboard(id: string): void;
  keepScreenOn(on: boolean): void;
  appVersion(): number;
  haptic?(): void;
};
declare global { interface Window { De1naNative?: Bridge; __de1naNative?: { resolve: (id: string, value: string | null) => void } } }

export const nativeBridge = (): Bridge | null => (typeof window !== 'undefined' && window.De1naNative) || null;
export const isNativeApp = () => !!nativeBridge();

const pending = new Map<string, (value: string | null) => void>();
function call(method: 'requestPushToken' | 'readClipboard', timeoutMs = 20000) {
  const bridge = nativeBridge();
  if (!bridge) return Promise.resolve(null);
  if (!window.__de1naNative) window.__de1naNative = { resolve: (id, value) => { pending.get(id)?.(value); pending.delete(id); } };
  const id = Math.random().toString(36).slice(2);
  return new Promise<string | null>((resolve) => {
    pending.set(id, resolve);
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); resolve(null); } }, timeoutMs);
    bridge[method](id);
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
