import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { validPushEndpoint } from '@/lib/push';
export const maxDuration = 60;
export const runtime = 'nodejs';
type Job = { id: string; lease: string; kind: string; title: string; body: string; tag: string; expires_at: string; endpoint: string; keys: { p256dh: string; auth: string } };
export async function POST(request: Request) {
  const expected = process.env.PUSH_WORKER_KEY, provided = request.headers.get('x-push-key') || '';
  if (!expected || !/^[a-f0-9]{64}$/.test(provided) || provided.length !== expected.length || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected)))
    return new Response(null, { status: 401 });
  const publicKey = process.env.VAPID_PUBLIC_KEY, privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return new Response(null, { status: 503 });
  try {
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    let processed = 0;
    for (let batch = 0; batch < 2; batch++) {
      const { data, error } = await client.rpc('push_worker', { worker_key: expected, action: 'claim', payload: {} });
      if (error) throw error;
      const jobs = data as Job[];
      if (!Array.isArray(jobs)) throw Error();
      await Promise.all(jobs.map(async job => {
        let code: number | null = null;
        const ttl = Math.min(86400, Math.floor((Date.parse(job.expires_at) - Date.now()) / 1000));
        if (!validPushEndpoint(job.endpoint) || ttl <= 0) code = 400;
        else {
          try {
            const response = await webpush.sendNotification({ endpoint: job.endpoint, keys: job.keys }, JSON.stringify({ title: job.title, body: job.body, tag: job.tag, url: '/dashboard#home', expiresAt: job.expires_at }), {
              vapidDetails: { subject: 'https://deuna-five.vercel.app', publicKey, privateKey },
              TTL: ttl, timeout: 8000, urgency: job.kind === 'promotion' ? 'normal' : 'high', topic: job.id.replaceAll('-', ''),
            });
            code = response.statusCode;
          } catch (error) { code = (error as { statusCode?: number }).statusCode || null; }
        }
        const { error: finishError } = await client.rpc('push_worker', { worker_key: expected, action: 'finish', payload: { id: job.id, lease: job.lease, code } });
        if (finishError) throw finishError;
        processed++;
      }));
      if (jobs.length < 20) break;
    }
    return Response.json({ processed }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'No se pudo completar el envío.' }, { status: 503 }); }
}
