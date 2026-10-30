import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
test("usuario sin sesi?n: acceso p?blico y rutas protegidas", async () => {
  const child = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3187",
    ],
    {
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: "",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      if (child.exitCode !== null) throw Error(log);
      try {
        const r = await fetch("http://127.0.0.1:3187/login", {
          signal: AbortSignal.timeout(1000),
        });
        if (r.status === 200) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }
    assert.ok(ready, log);
    const html = await (await fetch("http://127.0.0.1:3187/login")).text();
    assert.match(html, /De1na/);
    assert.match(html, /name="email"|El acceso/);
    const manifest = await (
      await fetch("http://127.0.0.1:3187/manifest.webmanifest")
    ).json();
    assert.equal(manifest.display, "standalone");
    assert.equal(manifest.start_url, "/dashboard");
    assert.match(html, /apple-touch-icon/);
    assert.equal(
      (await fetch("http://127.0.0.1:3187/favicon.ico")).status,
      200,
    );
    assert.equal((await fetch("http://127.0.0.1:3187/sw.js")).status, 200);
    assert.match(
      await (await fetch("http://127.0.0.1:3187/offline.html")).text(),
      /Volver a intentar/,
    );
    for (const icon of manifest.icons) {
      const response = await fetch("http://127.0.0.1:3187" + icon.src);
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type"), /image\/png/);
      const bytes = Buffer.from(await response.arrayBuffer());
      const dimension = Number(icon.sizes.split("x")[0]);
      assert.equal(bytes.readUInt32BE(16), dimension);
      assert.equal(bytes.readUInt32BE(20), dimension);
    }

    for (const path of ["/", "/dashboard", "/reset-password"]) {
      const r = await fetch("http://127.0.0.1:3187" + path, {
        redirect: "manual",
      });
      assert.ok([307, 308].includes(r.status), path);
    }
    assert.equal(
      (await fetch("http://127.0.0.1:3187/does-not-exist")).status,
      404,
    );
  } finally {
    if (child.exitCode === null) {
      const exit = once(child, "exit");
      child.kill();
      await exit;
    }
  }
});
