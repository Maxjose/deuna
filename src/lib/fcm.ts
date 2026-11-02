import { createSign } from 'node:crypto';

/** Envío de notificaciones a la app Android nativa con FCM HTTP v1 (cuenta de servicio en FIREBASE_SERVICE_ACCOUNT). */
type ServiceAccount = { project_id: string; client_email: string; private_key: string };
let cached: { token: string; expires: number } | null = null;

export function serviceAccount(): ServiceAccount | null {
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ServiceAccount;
    return parsed.project_id && parsed.client_email && parsed.private_key ? { ...parsed, private_key: parsed.private_key.replace(/\\n/g, '\n') } : null;
  } catch { return null; }
}

const b64 = (value: string | Buffer) => Buffer.from(value).toString('base64url');

export function signedAssertion(account: ServiceAccount, now = Math.floor(Date.now() / 1000)) {
  const header = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64(JSON.stringify({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(account.private_key);
  return `${header}.${claims}.${b64(signature)}`;
}

async function accessToken(account: ServiceAccount) {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(8000),
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: signedAssertion(account) }),
  });
  if (!response.ok) throw new Error('FCM auth ' + response.status);
  const body = await response.json() as { access_token: string; expires_in: number };
  cached = { token: body.access_token, expires: Date.now() + body.expires_in * 1000 };
  return cached.token;
}

/** Devuelve un código HTTP equivalente al de web push (410 = token inválido: se borra el dispositivo). */
export async function sendFcm(token: string, message: { title: string; body: string; tag: string; url: string; ttl: number; high: boolean }) {
  const account = serviceAccount();
  if (!account) return 503;
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
    method: 'POST', signal: AbortSignal.timeout(8000),
    headers: { Authorization: `Bearer ${await accessToken(account)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: {
      token,
      data: { title: message.title, body: message.body, tag: message.tag, url: message.url },
      android: { priority: message.high ? 'HIGH' : 'NORMAL', ttl: `${Math.max(1, message.ttl)}s`, collapse_key: message.tag.slice(0, 64) },
    } }),
  });
  if (response.ok) return 200;
  if (response.status === 404) return 410;
  if (response.status === 400) {
    const text = await response.text();
    return /UNREGISTERED|INVALID_ARGUMENT.*token|registration token/i.test(text) ? 410 : 400;
  }
  return response.status;
}
