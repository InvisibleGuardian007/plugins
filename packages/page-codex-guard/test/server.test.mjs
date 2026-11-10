import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startServer } from "../lib/server.mjs";

function home() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codex-guard-srv-"));
}

function writeState(dir, json) {
  fs.writeFileSync(path.join(dir, ".codex-global-state.json"), JSON.stringify(json, null, 2));
}

function healthy() {
  const json = {};
  for (let i = 0; i < 35; i += 1) json["key" + i] = i;
  json["local-projects"] = { a: { name: "Monster-Girl" } };
  json["thread-project-assignments"] = { t1: "a" };
  return json;
}

async function withServer(fn) {
  const dir = home();
  const server = await startServer({ port: 0, options: { codexHome: dir, gateway: "http://127.0.0.1:1", configDir: dir } });
  try {
    await fn(server, dir);
  } finally {
    server.close();
  }
}

test("the health route answers without a token", async () => {
  await withServer(async (server) => {
    const res = await fetch("http://127.0.0.1:" + server.port + "/_codexguard/health");
    assert.equal(res.status, 200);
    const said = await res.json();
    assert.equal(said.app, "codex-guard");
  });
});

test("an api route without the token is refused", async () => {
  await withServer(async (server) => {
    const res = await fetch("http://127.0.0.1:" + server.port + "/api/state");
    assert.equal(res.status, 401);
  });
});

test("a foreign Host header is refused", async () => {
  const http = await import("node:http");
  await withServer(async (server) => {
    const status = await new Promise((done, fail) => {
      const req = http.request(
        { host: "127.0.0.1", port: server.port, path: "/_codexguard/health", headers: { host: "example.com" } },
        (res) => {
          res.resume();
          done(res.statusCode);
        }
      );
      req.on("error", fail);
      req.end();
    });
    assert.equal(status, 403);
  });
});

test("state, snapshot and restore through the api", async () => {
  await withServer(async (server, dir) => {
    writeState(dir, healthy());
    const headers = { "x-codex-guard-token": server.token };
    const state = await (await fetch("http://127.0.0.1:" + server.port + "/api/state", { headers })).json();
    assert.equal(state.codex.mode, "healthy");
    assert.equal(state.quota.ok, false, "a dead gateway is reported, not thrown");

    const made = await (await fetch("http://127.0.0.1:" + server.port + "/api/snapshot", {
      method: "POST",
      headers: Object.assign({ "content-type": "application/json" }, headers),
      body: JSON.stringify({ name: "good" })
    })).json();
    assert.equal(made.ok, true);
    assert.equal(made.snapshot.topKeys, made.snapshot.topKeys);

    writeState(dir, { a: 1, b: 2 });
    const restored = await (await fetch("http://127.0.0.1:" + server.port + "/api/restore", {
      method: "POST",
      headers: Object.assign({ "content-type": "application/json" }, headers),
      body: JSON.stringify({ name: "good" })
    })).json();
    assert.equal(restored.ok, true);
    assert.equal(restored.state.codex.mode, "healthy");
  });
});

test("the page html carries the token and a strict policy", async () => {
  await withServer(async (server) => {
    const res = await fetch("http://127.0.0.1:" + server.port + "/");
    const html = await res.text();
    assert.ok(html.includes(server.token));
    assert.match(res.headers.get("content-security-policy") || "", /default-src 'none'/);
    assert.match(res.headers.get("content-security-policy") || "", /connect-src 'self' http:\/\/127\.0\.0\.1:/);
  });
});
