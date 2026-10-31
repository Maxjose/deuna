/** Actualizaciones de la app Android (TWA) distribuida fuera de Play Store. */
export type AppRelease = { versionCode: number; minVersionCode: number; apkUrl: string; notes: string; builtAt: string | null };
export type UpdateNeed = 'none' | 'optional' | 'required';

const STORAGE_KEY = 'de1na-app-version';
export const APK_URL = 'https://github.com/Maxjose/deuna/releases/download/apk-pruebas/de1na-pruebas.apk';
export const RELEASE_MANIFEST_URL = 'https://github.com/Maxjose/deuna/releases/download/apk-pruebas/version.json';

function positiveInt(value: unknown) {
  const n = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < 1e9 ? n : null;
}

/** Valida el version.json publicado por GitHub Actions y le añade la versión mínima exigida. */
export function parseRelease(raw: unknown, minVersionCode: number): AppRelease | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const versionCode = positiveInt(data.versionCode);
  const apkUrl = typeof data.apkUrl === 'string' && data.apkUrl.startsWith('https://github.com/Maxjose/deuna/releases/download/') ? data.apkUrl : null;
  if (versionCode == null || versionCode < 1 || !apkUrl) return null;
  const notes = typeof data.notes === 'string' ? data.notes.trim().slice(0, 200) : '';
  const builtAt = typeof data.builtAt === 'string' && !Number.isNaN(Date.parse(data.builtAt)) ? data.builtAt : null;
  return { versionCode, minVersionCode: Math.min(Math.max(0, minVersionCode), versionCode), apkUrl, notes, builtAt };
}

/** Versión instalada: la app la envía al abrirse (?app_version=N). Las primeras versiones no la enviaban: 0. */
export function installedVersion(search: string, stored: string | null) {
  const fromUrl = positiveInt(new URLSearchParams(search).get('app_version'));
  if (fromUrl != null) return { version: fromUrl, store: String(fromUrl) };
  const fromStorage = positiveInt(stored);
  return { version: fromStorage ?? 0, store: null as string | null };
}

export function updateNeed(installed: number, release: AppRelease | null): UpdateNeed {
  if (!release || installed >= release.versionCode) return 'none';
  return installed < release.minVersionCode ? 'required' : 'optional';
}

export function readInstalledVersion() {
  let stored: string | null = null;
  try { stored = localStorage.getItem(STORAGE_KEY); } catch { /* sin almacenamiento */ }
  const result = installedVersion(window.location.search, stored);
  if (result.store) { try { localStorage.setItem(STORAGE_KEY, result.store); } catch { /* sin almacenamiento */ } }
  return result.version;
}
