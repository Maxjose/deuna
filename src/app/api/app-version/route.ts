import policy from '@/lib/app-update-policy.json';
import { parseRelease, RELEASE_MANIFEST_URL, type AppRelease } from '@/lib/app-update';

// La última versión del APK se publica en GitHub (Releases). Se consulta desde el servidor
// (el navegador no puede leerla directamente) y se guarda 5 minutos.
let cached: { at: number; release: AppRelease | null } | null = null;
const TTL = 5 * 60 * 1000;

export async function GET() {
  if (!cached || Date.now() - cached.at > TTL) {
    let release: AppRelease | null = null;
    try {
      const response = await fetch(RELEASE_MANIFEST_URL, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
      if (response.ok) release = parseRelease(await response.json(), Number(policy.minVersionCode) || 0);
    } catch { /* GitHub no disponible: sin aviso de actualización */ }
    // Si falla, se reintenta en 1 minuto en vez de 5.
    cached = { at: release ? Date.now() : Date.now() - TTL + 60000, release };
  }
  return Response.json({ release: cached.release }, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } });
}
