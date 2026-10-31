import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { TesoroClient, type ValidationResult } from '@/lib/tesoro';
export const maxDuration = 60;
export const runtime = 'nodejs';
const WINDOW_MS = 50_000, POLL_MS = 5_000;

type Job = { trip_id: string; lease: string; reference: string; bank: string; phone: string; amount: string; attempts: number };

// Llamado por Supabase (al informar un pago y cada minuto) con la misma clave de servidor que el envío push.
// Abre una sola sesión en Tesoro Pagos, la mantiene hasta 50 s recogiendo pagos y reintentos, y siempre cierra sesión.
export async function POST(request: Request) {
  const expected = process.env.PUSH_WORKER_KEY, provided = request.headers.get('x-push-key') || '';
  if (!expected || !/^[a-f0-9]{64}$/.test(provided) || provided.length !== expected.length || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected)))
    return new Response(null, { status: 401 });
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const worker = (action: string, payload: Record<string, unknown> = {}) => client.rpc('payment_worker', { worker_key: expected, action, payload });
  const health = (ok: boolean, message: string) => worker('health', { ok, message });

  // Turno exclusivo: si ya hay una sesión verificando, ella recogerá los pagos nuevos.
  const started = await worker('start');
  const run = (started.data as { run?: string | null } | null)?.run;
  if (started.error || !run) return Response.json({ processed: 0, skipped: true }, { headers: { 'Cache-Control': 'no-store' } });

  const finish = (job: Job, result: ValidationResult) =>
    worker('finish', { trip_id: job.trip_id, lease: job.lease, outcome: result.outcome === 'verified' || result.outcome === 'not_found' || result.outcome === 'error' ? result.outcome : 'review', message: result.message });
  const claim = async () => {
    const { data, error } = await worker('claim', { run });
    if (error || !Array.isArray(data)) throw new Error('No se pudieron leer los pagos');
    return data as Job[];
  };

  const begin = Date.now(), windowEnd = begin + WINDOW_MS;
  let tesoro: TesoroClient | null = null, loggedIn = false, processed = 0;
  try {
    let jobs = await claim();
    if (!jobs.length) return Response.json({ processed: 0 }, { headers: { 'Cache-Control': 'no-store' } });
    tesoro = TesoroClient.fromEnv();
    if (!tesoro) {
      await health(false, 'Faltan las credenciales de Tesoro Pagos en el servidor');
      await Promise.all(jobs.map((job) => finish(job, { outcome: 'error', message: 'Verificador sin configurar' })));
      return Response.json({ error: 'Verificador sin configurar.' }, { status: 503 });
    }
    // Una sola sesión: se queda abierta durante la ventana, recogiendo pagos nuevos y reintentos.
    while (true) {
      if (jobs.length) {
        if (!loggedIn) {
          try { await tesoro.login(); loggedIn = true; }
          catch (failure) {
            const message = failure instanceof Error ? failure.message : 'Tesoro Pagos no respondió';
            await health(false, message);
            await Promise.all(jobs.map((job) => finish(job, { outcome: 'error', message })));
            break;
          }
        }
        for (const job of jobs) {
          let result: ValidationResult;
          try { result = await tesoro.validate({ amount: job.amount, bank: job.bank, phone: job.phone, reference: job.reference }); }
          catch { result = { outcome: 'error', message: 'No se pudo consultar Tesoro Pagos' }; }
          if (result.outcome === 'already_confirmed') result = { outcome: 'already_confirmed', message: 'El banco indica que este pago ya fue confirmado antes' };
          await finish(job, result);
          processed++;
        }
        await health(true, 'Conectado');
      }
      if (Date.now() + POLL_MS >= windowEnd) break;
      // Cerrar antes si no hay nada que revisar dentro de lo que queda de ventana.
      const next = await worker('next_due');
      const due = (next.data as { next_due?: string | null } | null)?.next_due;
      if (!due || Date.parse(due) > windowEnd) break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(POLL_MS, Math.max(500, Date.parse(due) - Date.now()))));
      jobs = await claim();
    }
  } catch (failure) {
    await health(false, failure instanceof Error ? failure.message : 'Error del verificador');
  } finally {
    if (loggedIn && tesoro) await tesoro.logout();
    await worker('end', { run });
  }
  return Response.json({ processed, seconds: Math.round((Date.now() - begin) / 1000) }, { headers: { 'Cache-Control': 'no-store' } });
}
