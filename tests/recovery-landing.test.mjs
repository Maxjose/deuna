import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const exports = {};
const source = ts.transpileModule(readFileSync(new URL('../src/lib/recovery-landing.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
runInNewContext(source, { exports, URLSearchParams });
const { recoveryLanding } = exports;

test('Site URL recovery bypasses installation and preserves tokens for validation', () => {
  const hash = '#access_token=test&refresh_token=refresh&type=recovery';
  for (const path of ['/', '/login', '/dashboard']) assert.equal(recoveryLanding(path, hash), '/reset-password' + hash);
  assert.equal(recoveryLanding('/reset-password', hash), null);
  assert.equal(recoveryLanding('/', '#access_token=test&refresh_token=refresh'), '/reset-password#access_token=test&refresh_token=refresh');
});

test('expired email opens recovery help; ordinary navigation and signup keep their flow', () => {
  assert.equal(recoveryLanding('/', '#error=access_denied&error_code=otp_expired'), '/reset-password#error=access_denied&error_code=otp_expired');
  for (const hash of ['', '#home', '#access_token=test&refresh_token=refresh&type=signup', '#next=https://example.com', '#access_token=test']) assert.equal(recoveryLanding('/', hash), null);
});
