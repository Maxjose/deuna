import test from 'node:test';
import assert from 'node:assert/strict';
import { fareCents, nightSurcharge } from '../src/lib/fare.ts';
const s = { base_cents: 100, per_km_cents: 50, minimum_cents: 150, rounding_cents: 1, night_enabled: true, night_start: '20:00:00', night_end: '05:00:00', night_percent: 20 };
// Caracas = UTC-4
const at = (h) => new Date(Date.UTC(2026, 10, 1, h + 4, 0));
test('tarifa nocturna: cruza medianoche y respeta el interruptor', () => {
  assert.equal(nightSurcharge(s, at(21)), 20);
  assert.equal(nightSurcharge(s, at(3)), 20);
  assert.equal(nightSurcharge(s, at(5)), 0);
  assert.equal(nightSurcharge(s, at(12)), 0);
  assert.equal(nightSurcharge({ ...s, night_enabled: false }, at(21)), 0);
  assert.equal(fareCents(4000, s, at(12)), 300);
  assert.equal(fareCents(4000, s, at(22)), 360);
  assert.equal(fareCents(4000, { ...s, rounding_cents: 50 }, at(22)), 400);
});
