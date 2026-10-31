/** App Android de pruebas (TWA). La app oficial tendrá su propio paquete. */
export const TWA_PACKAGE = 'com.de1na.app.pruebas';
const FLAG = 'de1na-twa';

/** True si la web se está mostrando dentro de la app Android (TWA). */
export function detectTwa(): boolean {
  if (typeof window === 'undefined') return false;
  let stored = false;
  try { stored = sessionStorage.getItem(FLAG) === '1'; } catch { /* sin almacenamiento */ }
  const fromLaunch = new URLSearchParams(window.location.search).get('source') === 'twa' || document.referrer.startsWith(`android-app://${TWA_PACKAGE}`);
  if (fromLaunch && !stored) { try { sessionStorage.setItem(FLAG, '1'); } catch { /* sin almacenamiento */ } }
  return stored || fromLaunch;
}

/** URL de intent que abre el servicio nativo de ubicación en segundo plano. */
export function trackingIntentUrl(action: 'start' | 'stop', params?: { token: string; url: string; key: string }) {
  const query = params ? '?' + new URLSearchParams({ token: params.token, url: params.url, key: params.key }).toString() : '';
  return `intent://${action}${query}#Intent;scheme=de1na-tracking;package=${TWA_PACKAGE};end`;
}
