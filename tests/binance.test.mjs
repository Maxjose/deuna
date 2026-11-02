import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { signQuery, matchTransaction, findPayTransaction } from '../src/lib/binance.ts';

test('binance: firma HMAC de la consulta', () => {
  const q = signQuery({ limit: 100, timestamp: 1 }, 'secreto');
  assert.equal(q, `limit=100&timestamp=1&signature=${createHmac('sha256', 'secreto').update('limit=100&timestamp=1').digest('hex')}`);
});

test('binance: solo ingresos en USDT', () => {
  const list = [{ transactionId: '111', transactionTime: 1, amount: '3.5', currency: 'USDT' }, { transactionId: '222', transactionTime: 1, amount: '-2', currency: 'USDT' }, { transactionId: '333', transactionTime: 1, amount: '5', currency: 'BTC' }];
  assert.equal(matchTransaction(list, '111').ok, true);
  assert.equal(matchTransaction(list, '222').reason, 'not_income');
  assert.equal(matchTransaction(list, '333').reason, 'currency');
  assert.equal(matchTransaction(list, '999'), null);
});

test('binance: busca en el historial y detecta región restringida', async () => {
  process.env.BINANCE_API_KEY = 'k'; process.env.BINANCE_API_SECRET = 's';
  let headersSeen;
  const ok = await findPayTransaction('111', 0, async (url, init) => { headersSeen = init.headers; return new Response(JSON.stringify({ success: true, data: [{ transactionId: 111, transactionTime: 5, amount: '3.5', currency: 'USDT' }] })); });
  assert.equal(ok.ok, true); assert.equal(headersSeen['X-MBX-APIKEY'], 'k');
  const blocked = await findPayTransaction('111', 0, async () => new Response('', { status: 451 }));
  assert.equal(blocked.reason, 'restricted');
  const missing = await findPayTransaction('111', 0, async () => new Response(JSON.stringify({ data: [] })));
  assert.equal(missing.reason, 'not_found');
});

test('binance: acepta el ID de la orden de la app y el transactionId de la API', async () => {
  const { canonicalId } = await import('../src/lib/binance.ts');
  const list = [{ transactionId: 'P_A25D6KYVRFS71116', orderId: '463317696761389056', transactionTime: 1, amount: '1', currency: 'USDT', orderType: 'C2C' }];
  assert.equal(matchTransaction(list, '463317696761389056').ok, true);
  assert.equal(matchTransaction(list, 'P_A25D6KYVRFS71116').ok, true);
  assert.equal(canonicalId(list[0]), '463317696761389056');
});
