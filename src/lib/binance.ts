import { createHmac } from 'node:crypto';

/** Movimiento de Binance Pay según "Get Pay Trade History" (GET /sapi/v1/pay/transactions). */
export type PayTransaction = { transactionId: string; transactionTime: number; amount: string; currency: string; orderType?: string };
export type BinanceLookup = { ok: true; tx: PayTransaction } | { ok: false; reason: 'not_found' | 'not_income' | 'currency' | 'config' | 'restricted' | 'error'; message: string };

const BASE = 'https://api.binance.com';

export function signQuery(params: Record<string, string | number>, secret: string) {
  const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  return `${query}&signature=${createHmac('sha256', secret).update(query).digest('hex')}`;
}

/** Comprueba un ID de transacción en el historial de Binance Pay de la cuenta receptora (solo lectura). */
export function matchTransaction(list: PayTransaction[], id: string): BinanceLookup | null {
  const tx = list.find((t) => String(t.transactionId) === id);
  if (!tx) return null;
  if (!(Number(tx.amount) > 0)) return { ok: false, reason: 'not_income', message: 'Esa transacción no es un pago recibido' };
  if (tx.currency !== 'USDT') return { ok: false, reason: 'currency', message: 'El pago debe ser en USDT' };
  return { ok: true, tx };
}

export async function findPayTransaction(id: string, sinceMs: number, fetcher: typeof fetch = fetch): Promise<BinanceLookup> {
  const key = process.env.BINANCE_API_KEY, secret = process.env.BINANCE_API_SECRET;
  if (!key || !secret) return { ok: false, reason: 'config', message: 'Binance Pay no está configurado' };
  let end = Date.now();
  // Hasta 3 páginas de 100 movimientos hacia atrás dentro de la ventana.
  for (let page = 0; page < 3 && end > sinceMs; page++) {
    const query = signQuery({ startTime: sinceMs, endTime: end, limit: 100, recvWindow: 10000, timestamp: Date.now() }, secret);
    const response = await fetcher(`${BASE}/sapi/v1/pay/transactions?${query}`, { headers: { 'X-MBX-APIKEY': key }, signal: AbortSignal.timeout(12000), cache: 'no-store' });
    if (response.status === 451 || response.status === 403) return { ok: false, reason: 'restricted', message: 'Binance rechazó la consulta desde esta región del servidor' };
    if (!response.ok) return { ok: false, reason: 'error', message: `Binance respondió ${response.status}` };
    const body = await response.json() as { data?: PayTransaction[]; success?: boolean };
    const list = Array.isArray(body.data) ? body.data : [];
    const found = matchTransaction(list, id);
    if (found) return found;
    if (list.length < 100) break;
    end = Math.min(...list.map((t) => Number(t.transactionTime))) - 1;
  }
  return { ok: false, reason: 'not_found', message: 'No encontramos esa transacción en Binance Pay' };
}

/** Últimos movimientos de Binance Pay (diagnóstico para la administración). */
export async function recentPayTransactions(limit = 15) {
  const key = process.env.BINANCE_API_KEY, secret = process.env.BINANCE_API_SECRET;
  if (!key || !secret) throw new Error('config');
  const query = signQuery({ startTime: Date.now() - 7 * 86400_000, endTime: Date.now(), limit: 100, recvWindow: 10000, timestamp: Date.now() }, secret);
  const response = await fetch(`${BASE}/sapi/v1/pay/transactions?${query}`, { headers: { 'X-MBX-APIKEY': key }, signal: AbortSignal.timeout(12000), cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Binance ${response.status}: ${JSON.stringify(body).slice(0, 200)}`);
  const list = (Array.isArray(body.data) ? body.data : []) as (PayTransaction & Record<string, unknown>)[];
  return list.slice(0, limit).map((t) => ({ transactionId: String(t.transactionId), orderType: t.orderType, time: new Date(Number(t.transactionTime)).toISOString(), amount: t.amount, currency: t.currency, otherKeys: Object.keys(t) }));
}
