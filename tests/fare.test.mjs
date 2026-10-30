import test from 'node:test';
import assert from 'node:assert/strict';
import { fareCents } from '../src/lib/fare.ts';
test('tarifa usa metros de carretera, base, mínimo y redondeo a centavos', () => {
  const settings = { base_cents: 100, per_km_cents: 50, minimum_cents: 200 };
  assert.equal(fareCents(1000, settings), 200);
  assert.equal(fareCents(5000, settings), 350);
  assert.equal(fareCents(3333, settings), 267);
  assert.equal(fareCents(1, { base_cents: 0, per_km_cents: 1, minimum_cents: 0 }), 1);
});
test('rechaza distancias y tarifas ausentes o inválidas', () => {
  const settings = { base_cents: 100, per_km_cents: 50, minimum_cents: 200 };
  for (const distance of [NaN, Infinity, -1, 0, 2000001]) assert.throws(() => fareCents(distance, settings));
  for (const per_km_cents of [null, 0, -10, 0.5]) assert.throws(() => fareCents(1000, { ...settings, per_km_cents }));
});
