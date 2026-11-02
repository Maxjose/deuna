import { serverClient } from '@/lib/supabase/server';
import { recentPayTransactions } from '@/lib/binance';
export const runtime = 'nodejs';

// Diagnóstico (solo administración): últimos movimientos de Binance Pay tal como los entrega la API.
export async function GET() {
  const client = await serverClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return new Response('No autorizado', { status: 401 });
  const { data: profile } = await client.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return new Response('No autorizado', { status: 403 });
  try { return Response.json(await recentPayTransactions(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'error' }, { status: 502 }); }
}
