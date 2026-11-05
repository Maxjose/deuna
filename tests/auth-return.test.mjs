import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { authReturnLinks } from '../src/lib/auth-return.ts';

test('confirmación: conserva el código sin permitir inyectar partes del intent', () => {
  const code = 'abc&next=https://evil.example/#Intent;package=other;end';
  const links = authReturnLinks(code, 'https://evil.example');
  const callback = new URL(links.callback, 'https://www.de1na.app');
  assert.equal(callback.searchParams.get('code'), code);
  assert.equal(callback.searchParams.get('next'), null);
  assert.equal(callback.searchParams.get('complete'), '1');
  assert.equal(links.app.split('#Intent;').length, 2);
  assert.ok(links.app.includes('package=com.de1na.app;'));
});
test('recuperación: vuelve al formulario y usa fallback del dominio propio', () => {
  const links = authReturnLinks('one-time-code', '/reset-password');
  assert.equal(new URL(links.callback, 'https://www.de1na.app').searchParams.get('next'), '/reset-password');
  const fallback = decodeURIComponent(links.app.match(/S.browser_fallback_url=([^;]+);/)[1]);
  assert.equal(new URL(fallback).origin, 'https://www.de1na.app');
  assert.equal(new URL(fallback).searchParams.get('code'), 'one-time-code');
});
test('el retorno al abrir el correo no queda bloqueado por la pantalla de instalación', () => {
  const gate = readFileSync(new URL('../src/components/install-gate.tsx', import.meta.url), 'utf8');
  assert.ok(gate.includes("window.location.pathname==='/auth/continue'"));
});
