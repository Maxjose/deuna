import test from "node:test";
import assert from "node:assert/strict";
import { destinationLabel } from "../src/lib/destination.ts";
test("destino escrito y punto confirmado conservan referencia y coordenadas dentro del límite de la base", () => {
  assert.equal(destinationLabel("  Plaza de El Moján  "), "Plaza de El Moján");
  const value = destinationLabel("Entrada principal", {
    lat: 11.087123,
    lng: -71.603123,
  });
  assert.equal(value, "Entrada principal · (11.08712, -71.60312)");
  assert.ok(
    destinationLabel("x".repeat(110), { lat: -90, lng: -180 }).length <= 150,
  );
});
test("rechaza referencias vacías y coordenadas inválidas antes de confirmar", () => {
  for (const name of ["", "   ", "x".repeat(111)])
    assert.throws(() => destinationLabel(name));
  for (const point of [
    { lat: 91, lng: 0 },
    { lat: 0, lng: 181 },
    { lat: NaN, lng: 1 },
  ])
    assert.throws(() => destinationLabel("Destino", point));
});
