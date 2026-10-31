import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { TesoroClient, type ValidationResult } from '@/lib/tesoro';
export const maxDuration = 60;
export const runtime = 'nodejs';

type Job = { trip_id: string; lease: string; reference: string; bank: string; phone: string; amount: string; attempts: number };

// Llamado por Supabase (al informar un pago y cada minuto) con la misma clave de servidor que el envío push.
export async function POST(request: Request) {
  const expected = process.env.PUSH_WORKER_KEY, provided = request.headers.get('x-push-key') || '';
  if (!expected || !/^[a-f0-9]{64}$/.test(provided) || provided.length !== expected.length || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected)))
    return new Response(null, { status: 401 });
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const worker = (action: string, payload: Record<string, unknown> = {}) => client.rpc('payment_worker', { worker_key: expected, action, payload });
  const health = (ok: boolean, message: string) => worker('health', { ok, message });

  const { data, error } = await worker('claim');
  if (error || !Array.isArray(data)) return Response.json({ error: 'No se pudieron leer los pagos.' }, { status: 503 });
  const jobs = data as Job[];
  if (!jobs.length) return Response.json({ processed: 0 }, { headers: { 'Cache-Control': 'no-store' } });

  const finish = (job: Job, result: ValidationResult) =>
    worker('finish', { trip_id: job.trip_id, lease: job.lease, outcome: result.outcome === 'verified' || result.outcome === 'not_found' || result.outcome === 'error' ? result.outcome : 'review', message: result.message });

  const tesoro = TesoroClient.fromEnv();
  if (!tesoro) {
    await health(false, 'Faltan las credenciales de Tesoro Pagos en el servidor');
    await Promise.all(jobs.map((job) => finish(job, { outcome: 'error', message: 'Verificador sin configurar' })));
    return Response.json({ error: 'Verificador sin configurar.' }, { status: 503 });
  }
  let processed = 0;
  try {
    await tesoro.login();
    for (const job of jobs) {
      let result: ValidationResult;
      try { result = await tesoro.validate({ amount: job.amount, bank: job.bank, phone: job.phone, reference: job.reference }); }
      catch { result = { outcome: 'error', message: 'No se pudo consultar Tesoro Pagos' }; }
      if (result.outcome === 'already_confirmed') result = { outcome: 'already_confirmed', message: 'El banco indica que este pago ya fue confirmado antes' };
      await finish(job, result);
      processed++;
    }
    await health(true, 'Conectado');
  } catch (failure) {
    const message = failure instanceof Error ? failure.message : 'Tesoro Pagos no respondió';
    await health(false, message);
    await Promise.all(jobs.slice(processed).map((job) => finish(job, { outcome: 'error', message })));
  } finally {
    await tesoro.logout();
  }
  return Response.json({ processed }, { headers: { 'Cache-Control': 'no-store' } });
}
