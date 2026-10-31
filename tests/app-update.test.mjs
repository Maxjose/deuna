import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRelease, installedVersion, updateNeed, APK_URL} from '../src/lib/app-update.ts';

const raw = {versionCode: 12, apkUrl: APK_URL, notes: ' Ubicación en segundo plano ', builtAt: '2026-10-31T15:00:00Z'};

test('actualizaciones: valida el version.json publicado', () => {
  assert.deepEqual(parseRelease(raw, 0), {versionCode: 12, minVersionCode: 0, apkUrl: APK_URL, notes: 'Ubicación en segundo plano', builtAt: '2026-10-31T15:00:00Z'});
  assert.equal(parseRelease({...raw, apkUrl: 'https://evil.example/app.apk'}, 0), null, 'solo descargas del repositorio');
  assert.equal(parseRelease({...raw, versionCode: 0}, 0), null);
  assert.equal(parseRelease(null, 0), null);
  assert.equal(parseRelease(raw, 99).minVersionCode, 12, 'el mínimo nunca supera la última versión');
});

test('actualizaciones: versión instalada desde la URL o lo guardado', () => {
  assert.deepEqual(installedVersion('?source=twa&app_version=7', null), {version: 7, store: '7'});
  assert.deepEqual(installedVersion('?source=twa', '7'), {version: 7, store: null});
  assert.deepEqual(installedVersion('?source=twa', null), {version: 0, store: null}, 'APK antiguo sin versión');
  assert.deepEqual(installedVersion('?app_version=abc', 'x'), {version: 0, store: null});
});

test('actualizaciones: opcional u obligatoria', () => {
  const release = parseRelease(raw, 10);
  assert.equal(updateNeed(12, release), 'none');
  assert.equal(updateNeed(13, release), 'none');
  assert.equal(updateNeed(11, release), 'optional');
  assert.equal(updateNeed(9, release), 'required');
  assert.equal(updateNeed(0, parseRelease(raw, 0)), 'optional');
  assert.equal(updateNeed(5, null), 'none');
});
