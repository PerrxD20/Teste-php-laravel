import { test } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../server/index.js";

test("coletor desktop usa porta dinâmica e bloqueia acessos sem o token da sessão", async () => {
  const token = "test-session-token-only";
  const runtime = await startServer({
    port: 0,
    desktop: true,
    apiToken: token,
  });
  try {
    const response = await fetch(runtime.url + "/api/health");
    assert.equal(response.status, 403);
    const wrong = await fetch(runtime.url + "/api/health", {
      headers: { "X-Mello-Token": "wrong" },
    });
    assert.equal(wrong.status, 403);
    const authorized = await fetch(runtime.url + "/api/health", {
      headers: { "X-Mello-Token": token },
    });
    assert.equal(authorized.status, 200);
    assert.equal((await authorized.json()).name, "Mello PC Diagnostic");
    const document = await fetch(runtime.url + "/");
    assert.equal(document.status, 200);
    assert.match(
      document.headers.get("content-security-policy"),
      /script-src 'self'/,
    );
    const foreign = await fetch(runtime.url + "/api/ram/test", {
      method: "POST",
      headers: {
        "X-Mello-Token": token,
        "Content-Type": "application/json",
        Origin: "https://untrusted.example",
      },
      body: "{}",
    });
    assert.equal(foreign.status, 403);
    const local = await fetch(runtime.url + "/api/ram/test", {
      method: "POST",
      headers: {
        "X-Mello-Token": token,
        "Content-Type": "application/json",
        Origin: runtime.url,
      },
      body: "{}",
    });
    assert.equal(local.status, 202);
  } finally {
    await runtime.close();
  }
});

test("encerrar uma instância libera a porta e não encerra outros coletores", async () => {
  const first = await startServer({ port: 0 });
  const second = await startServer({ port: 0 });
  assert.notEqual(first.url, second.url);
  await first.close();
  try {
    assert.equal((await fetch(second.url + "/api/health")).status, 200);
    await assert.rejects(fetch(first.url + "/api/health"));
  } finally {
    await second.close();
  }
});
