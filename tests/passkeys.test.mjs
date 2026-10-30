import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
test("passkeys: navegador incompatible no genera una sesión ni solicita credenciales", async () => {
  let requests = 0;
  const client = createClient(
    "https://example.supabase.co",
    "test-publishable-key",
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        experimental: { passkey: true },
      },
      global: {
        fetch: async () => {
          requests++;
          throw Error("No debe acceder a la red");
        },
      },
    },
  );
  const { data, error } = await client.auth.signInWithPasskey();
  assert.equal(data, null);
  assert.ok(error);
  assert.equal(requests, 0);
});
test("passkeys: un servidor que rechaza la función no devuelve opciones de autenticación", async () => {
  const client = createClient(
    "https://example.supabase.co",
    "test-publishable-key",
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        experimental: { passkey: true },
      },
      global: {
        fetch: async () =>
          new Response(
            JSON.stringify({ code: "passkey_disabled", msg: "Disabled" }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          ),
      },
    },
  );
  const { data, error } = await client.auth.passkey.startAuthentication();
  assert.equal(data, null);
  assert.ok(error);
  assert.equal((await client.auth.getSession()).data.session, null);
});
