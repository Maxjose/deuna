import { createClient } from '@supabase/supabase-js';
import { serverClient } from '@/lib/supabase/server';
import { findPayTransaction } from '@/lib/binance';
export const runtime = 'nodejs';
export const maxDuration = 30;
const headers = { 'Cache-Control': 'private, no-store' };
const DB_ERRORS: Record<string, string> = {
  'Transacción ya usada': 'Esa transacción ya fue usada.', 'Monto insuficiente': 'El monto pagado es menor al del viaje.',
  'Transacción anterior al viaje': 'Esa transacción es anterior a tu viaje.', 'Transacción muy antigua': 'Esa transacción es muy antigua para una recarga.',
  'Recargas no disponibles': 'Las recargas no están disponibles por ahora.', 'Binance Pay no disponible': 'Binance Pay no está disponible por ahora.',
  'Este pago ya fue verificado': 'Este pago ya fue verificado.', 'Espera a que un conductor acepte el viaje': 'Espera a que un conductor acepte tu viaje.',
  'Monto inválido': 'El monto de la recarga debe estar entre 1 y 1000 USDT.', 'Viaje no encontrado': 'No encontramos ese viaje.',
};

// El pasajero envía el ID de su transacción de Binance Pay; lo buscamos en el historial de la cuenta receptora
// (clave de solo lectura) y, si es un ingreso en USDT, la base de datos lo confirma con la clave del trabajador.
export async function POST(request: Request) {
  const session = await serverClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return Response.json({ error: 'Inicia sesión.' }, { status: 401, headers });
  let body: { kind?: string; trip_id?: string; transaction_id?: string };
  try { body = await request.json(); } catch { return Response.json({ error: 'Solicitud inválida.' }, { status: 400, headers }); }
  const id = String(body.transaction_id || '').replace(/\s/g, '');
  if (!/^[0-9A-Za-z]{6,64}$/.test(id) || (body.kind !== 'trip' && body.kind !== 'topup') || (body.kind === 'trip' && !/^[0-9a-f-]{36}$/.test(String(body.trip_id))))
    return Response.json({ error: 'Revisa el ID de la transacción.' }, { status: 400, headers });
  const key = process.env.PUSH_WORKER_KEY;
  if (!key) return Response.json({ error: 'Binance Pay no está configurado.' }, { status: 503, headers });
  let lookup;
  try { lookup = await findPayTransaction(id, Date.now() - 72 * 3600_000); }
  catch { return Response.json({ error: 'No pudimos consultar Binance. Inténtalo en unos minutos.' }, { status: 503, headers }); }
  if (!lookup.ok) {
    const status = lookup.reason === 'not_found' || lookup.reason === 'not_income' || lookup.reason === 'currency' ? 422 : 503;
    const message = lookup.reason === 'not_found' ? 'No encontramos esa transacción. Revisa el ID; si acabas de pagar, espera un minuto y vuelve a intentar.'
      : lookup.reason === 'not_income' || lookup.reason === 'currency' ? lookup.message + '.' : 'No pudimos consultar Binance. Inténtalo en unos minutos.';
    if (status === 503) console.error('binance verify', lookup.reason, lookup.message);
    return Response.json({ error: message }, { status, headers });
  }
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.rpc('binance_confirm', { worker_key: key, payload: {
    kind: body.kind, user_id: user.id, trip_id: body.trip_id ?? null, transaction_id: id,
    amount: lookup.tx.amount, currency: lookup.tx.currency, transaction_time: lookup.tx.transactionTime } });
  if (error) return Response.json({ error: DB_ERRORS[error.message] || 'No pudimos confirmar el pago.' }, { status: 422, headers });
  return Response.json(data, { headers });
}
