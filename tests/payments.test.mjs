import test from 'node:test';
import assert from 'node:assert/strict';
import {bsAmount,bs,pagoMovilReady,formatPhone,formatIdNumber,cleanReference,rateValue} from '../src/lib/payments.ts';

test('pagos: conversión a bolívares con la tasa configurada', () => {
  assert.equal(bsAmount(350, 40.5), 141.75);
  assert.equal(bsAmount(350, '40.5000'), 141.75, 'numeric llega como texto desde PostgREST');
  assert.equal(bsAmount(199, 36.1234), 71.89);
  assert.equal(bsAmount(350, null), null);
  assert.equal(bsAmount(350, 0), null);
  assert.equal(rateValue('abc'), null);
  assert.match(bs(1234.5), /^Bs\. 1\.234,50$/);
});

test('pagos: pago móvil solo disponible con datos y tasa', () => {
  const full = {pago_movil_bank: 'Banco', pago_movil_phone: '04141234567', pago_movil_id: 'V12345678', exchange_rate: '40'};
  assert.equal(pagoMovilReady(full), true);
  for (const key of Object.keys(full)) assert.equal(pagoMovilReady({...full, [key]: null}), false, key);
  assert.equal(pagoMovilReady(null), false);
});

test('pagos: formato de datos y referencia', () => {
  assert.equal(formatPhone('04141234567'), '0414-1234567');
  assert.equal(formatIdNumber('V12345678'), 'V-12.345.678');
  assert.equal(cleanReference(' 0012-3456 '), '00123456');
  assert.equal(cleanReference('12'), null);
  assert.equal(cleanReference('1'.repeat(21)), null);
});

test('pagos: estado, teléfono y monto escrito', async () => {
  const {paymentStatusLabel, cleanPhone, parseBs, bankName} = await import('../src/lib/payments.ts');
  assert.equal(paymentStatusLabel(null, false).label, 'Esperando referencia');
  assert.equal(paymentStatusLabel('checking', true).label, 'Verificando pago…');
  assert.equal(paymentStatusLabel('review', true).tone, 'review');
  assert.equal(paymentStatusLabel('verified', true).tone, 'ok');
  assert.equal(cleanPhone('0412-123.45.67'), '04121234567');
  assert.equal(cleanPhone('4121234567'), null);
  assert.equal(parseBs('3.680,50'), 3680.5);
  assert.equal(parseBs('3680.5'), 3680.5);
  assert.equal(parseBs('Bs. 20,00'), 20);
  assert.equal(parseBs('abc'), null);
  assert.equal(bankName('0163'), 'Banco del Tesoro');
});
