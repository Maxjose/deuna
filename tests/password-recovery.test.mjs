import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function recoveryModule(createClient = () => ({})) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL('../src/lib/supabase/recovery.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(source, { exports, URLSearchParams, process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'public-test-key' } }, require: () => ({ createClient }) });
  return exports;
}

test('recovery email works without PKCE storage from the app', async () => {
  let configuration, request;
  const module = recoveryModule((_url, _key, options) => {
    configuration = options;
    return { auth: { resetPasswordForEmail: async (email, options) => { request = { email, options }; return { error: null }; } } };
  });
  await module.sendRecoveryEmail('test@example.com', 'https://www.de1na.app');
  assert.equal(configuration.auth.flowType, 'implicit');
  assert.equal(configuration.auth.persistSession, false);
  assert.equal(configuration.auth.detectSessionInUrl, false);
  assert.equal(request.options.redirectTo, 'https://www.de1na.app/auth/callback?next=/reset-password');
});

test('only complete recovery fragments can authorize password recovery', () => {
  const { recoveryTokens } = recoveryModule();
  assert.equal(recoveryTokens('#access_token=a&refresh_token=r&type=recovery').access_token, 'a');
  for (const hash of ['', '#type=recovery', '#access_token=a&type=recovery', '#access_token=a&refresh_token=r&type=signup', '#access_token=a&refresh_token=r&type=recovery&error=access_denied']) {
    assert.equal(recoveryTokens(hash), null);
  }
});
