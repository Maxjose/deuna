import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldShareFix,shareParams,locationFreshness,ageLabel,etaMinutes,distanceMeters} from '../src/lib/live-location.ts';

test('ubicación en vivo: envía con movimiento, latido y sin saturar', () => {
  const point = {lat: 10.7, lng: -71.6}, moved = {lat: 10.7005, lng: -71.6}, now = 100000;
  assert.equal(shouldShareFix(null, point, now), true);
  assert.equal(shouldShareFix({point, at: now - 2000}, moved, now), false, 'muy pronto');
  assert.equal(shouldShareFix({point, at: now - 5000}, moved, now), true, 'se movió ~55 m');
  assert.equal(shouldShareFix({point, at: now - 5000}, {lat: 10.70001, lng: -71.6}, now), false, 'detenido');
  assert.equal(shouldShareFix({point, at: now - 16000}, point, now), true, 'latido');
  assert.ok(Math.abs(distanceMeters(point, moved) - 55.6) < 1);
});

test('ubicación en vivo: parámetros limpios para share_location', () => {
  const params = shareParams('trip', {lat: 10.7, lng: -71.6, accuracy: 12.345, timestamp: 0, heading: NaN, speed: -1});
  assert.deepEqual(params, {trip_id: 'trip', latitude: 10.7, longitude: -71.6, accuracy: 12.3, heading: null, speed: null, recorded_at: '1970-01-01T00:00:00.000Z'});
  assert.equal(shareParams('t', {lat: 0, lng: 0, accuracy: 5, timestamp: 0, heading: 360, speed: 4}).heading, null);
  assert.equal(shareParams('t', {lat: 0, lng: 0, accuracy: 5, timestamp: 0, heading: 90, speed: 4}).speed, 4);
});

test('ubicación en vivo: frescura, antigüedad y tiempo estimado', () => {
  const now = Date.parse('2026-10-31T12:00:00Z');
  assert.equal(locationFreshness('2026-10-31T11:59:50Z', now), 'live');
  assert.equal(locationFreshness('2026-10-31T11:59:00Z', now), 'stale');
  assert.equal(locationFreshness('2026-10-31T11:55:00Z', now), 'lost');
  assert.equal(locationFreshness('no es fecha', now), 'lost');
  assert.equal(ageLabel('2026-10-31T11:59:55Z', now), 'ahora mismo');
  assert.equal(ageLabel('2026-10-31T11:59:30Z', now), 'hace 30 s');
  assert.equal(ageLabel('2026-10-31T11:57:00Z', now), 'hace 3 min');
  assert.equal(etaMinutes({lat: 10.7, lng: -71.6}, {lat: 10.7, lng: -71.6}), 1);
  assert.equal(etaMinutes({lat: 10.7, lng: -71.6}, {lat: 10.72, lng: -71.6}), 7);
});

test('ubicación en vivo: tolera señal imprecisa al compartir, pero no datos inválidos', async () => {
  const {shareableFix} = await import('../src/lib/live-location.ts');
  const now = 100000, fix = {lat: 10.7, lng: -71.6, accuracy: 350, timestamp: now - 30000};
  assert.equal(shareableFix(fix, now), true, 'interiores: 350 m y 30 s');
  for (const change of [{accuracy: 1500}, {timestamp: now - 61000}, {lat: 91}, {lng: NaN}, {accuracy: -1}]) assert.equal(shareableFix({...fix, ...change}, now), false);
});
