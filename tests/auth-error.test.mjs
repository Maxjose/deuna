import test from 'node:test';
import assert from 'node:assert/strict';
import { authErrorMessage } from '../src/lib/auth-error.ts';

test('email throttling explains confirmation and waiting instead of suggesting registration failed', () => {
  const message = authErrorMessage({ code: 'over_email_send_rate_limit', status: 429 });
  assert.match(message, /correos demasiado seguido/);
  assert.match(message, /confirmar tu cuenta/);
  assert.match(message, /espera unos minutos/);
  assert.doesNotMatch(message, /No pudimos/);
});

test('unverified email and request throttling retain actionable instructions', () => {
  assert.match(authErrorMessage({ code: 'email_not_confirmed' }), /aún no está verificado/);
  assert.match(authErrorMessage({ code: 'over_request_rate_limit' }), /Espera unos minutos/);
});

test('unexpected auth errors never expose provider messages or internal data', () => {
  for (const error of [null, undefined, { code: 'unexpected_failure', message: 'private internal data' }]) {
    assert.equal(authErrorMessage(error), 'No pudimos completar la solicitud. Revisa tus datos y la conexión o inténtalo más tarde.');
  }
});
