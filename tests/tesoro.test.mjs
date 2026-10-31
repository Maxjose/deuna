import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyValidation, csrfToken, validationMessage} from '../src/lib/tesoro.ts';

const modal = (text) => `<div class="fixed"><svg><path d="M6 18L18 6M6 6l12 12" /></svg></div> <p class="text-gray-600 text-lg font-medium mb-10">\n  ${text}\n </p><button onclick="this.closest('.fixed').remove()">Aceptar</button>`;
const page = (body) => `<html><head><meta name="csrf-token" content="abc"></head><body><form id="form-confirmacion-pago" action="/pago-movil" method="POST"><input type="hidden" name="_token" value="tok123"></form>${body}<script>Swal.fire({html:'<p class="text-gray-600 text-lg font-medium mb-4">Su sesión ha terminado</p>'})</script></body></html>`;

test('Tesoro Pagos: lee el resultado de "Validar pago"', () => {
  assert.deepEqual(classifyValidation(page(modal('Pago Movil No encontrado'))), {outcome: 'not_found', message: 'Pago Movil No encontrado'});
  assert.equal(classifyValidation(page(modal('Este pago ya fue confirmado anteriormente.'))).outcome, 'already_confirmed');
  assert.equal(classifyValidation(page(modal('Pago Móvil confirmado exitosamente'))).outcome, 'verified');
  assert.equal(classifyValidation(page(modal('Pago Movil verificado'))).outcome, 'verified');
  assert.equal(classifyValidation(page('')).outcome, 'unknown', 'sin aviso no se da por bueno');
  assert.equal(classifyValidation(page(modal('Algo raro'))).outcome, 'unknown');
  assert.equal(classifyValidation('<input name="box_number"><input name="password">').outcome, 'error', 'sesión cerrada');
  assert.equal(validationMessage(page(modal('Pago M&oacute;vil No encontrado'))), 'Pago Móvil No encontrado');
});

test('Tesoro Pagos: token del formulario', () => {
  assert.equal(csrfToken(page(''), 'form-confirmacion-pago'), 'tok123');
  assert.equal(csrfToken('<input type="hidden" name="_token" value="z9" autocomplete="off">'), 'z9');
  assert.equal(csrfToken('<p>sin token</p>'), null);
});
