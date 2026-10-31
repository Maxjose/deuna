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
test('redondea hacia arriba al siguiente medio dolar despues de aplicar el minimo',()=>{
 const settings={base_cents:0,per_km_cents:100,minimum_cents:0,rounding_cents:50};
 for(const [meters,expected] of [[1000,100],[1200,150],[1500,150],[1600,200],[1800,200],[1900,200],[2000,200],[2100,250]])assert.equal(fareCents(meters,settings),expected);
 assert.equal(fareCents(1200,{...settings,minimum_cents:180}),200);
 assert.equal(fareCents(1200,{...settings,rounding_cents:100}),200);
 assert.equal(fareCents(1200,{...settings,rounding_cents:1}),120);
 for(const rounding_cents of [0,25,-50,NaN,null])assert.throws(()=>fareCents(1000,{...settings,rounding_cents}));
});
