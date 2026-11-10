import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { codexHome, inspect, listSnapshots, makeSnapshot, restoreSnapshot, newestHealthy, snapshotName, backupRoot } from "./codex.mjs";
import { readQuotas } from "./quota.mjs";
import { readRouting } from "./routing.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UI = path.join(HERE, "..", "ui");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8"
};

function send(res, status, type, body, extra) {
  const headers = Object.assign({ "content-type": type, "cache-control": "no-store" }, extra || {});
  res.writeHead(status, headers);
  res.end(body);
}

function json(res, status, value) {
  send(res, status, "application/json; charset=utf-8", JSON.stringify(value));
}

function allowedHost(host, port) {
  const value = String(host || "").toLowerCase();
  return (
    value === "127.0.0.1:" + port ||
    value === "localhost:" + port ||
    value === "[::1]:" + port
  );
}

// The page runs in an opaque-sandboxed frame, so its fetch carries
// Origin: null. Echoing "null" back, together with the token header, is what
// lets that one frame reach the service and nothing else.
function allowOpaqueOrigin(req, res) {
  if (req.headers.origin === "null") {
    res.setHeader("access-control-allow-origin", "null");
    res.setHeader("access-control-allow-headers", "content-type, x-codex-guard-token");
    res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
    res.setHeader("vary", "origin");
    return true;
  }
  return false;
}

function settingsFile(home) {
  return path.join(backupRoot(home), "guard-settings.json");
}

function readSettings(home, defaults) {
  let saved = {};
  try {
    saved = JSON.parse(fs.readFileSync(settingsFile(home), "utf8")) || {};
  } catch {
    saved = {};
  }
  return Object.assign(
    {
      autoRestore: Boolean(defaults && defaults.autoRestore),
      gateway: String((defaults && defaults.gateway) || "http://127.0.0.1:3425"),
      lastCheck: null,
      lastRestore: null,
      log: []
    },
    saved && typeof saved === "object" ? saved : {}
  );
}

function writeSettings(home, value) {
  try {
    fs.mkdirSync(backupRoot(home), { recursive: true });
    fs.writeFileSync(settingsFile(home), JSON.stringify(value, null, 2) + "\n");
  } catch {
    // A read-only profile keeps working; only persistence is lost.
  }
}

function appendLog(settings, line, mode) {
  const rows = Array.isArray(settings.log) ? settings.log.slice(-40) : [];
  rows.push({ at: new Date().toISOString(), line: String(line).slice(0, 300), mode: mode || "" });
  settings.log = rows;
}

export function startServer(config) {
  const options = (config && config.options) || {};
  const port = config && config.port !== undefined ? Number(config.port) : 4391;
  return new Promise((resolve, reject) => {
    const token = randomBytes(24).toString("base64url");
    const home = codexHome(options);
    const settings = readSettings(home, options);
    let boundPort = port;

    async function snapshotState() {
      const codex = inspect(home);
      let quota = { ok: false, gateway: settings.gateway, rows: [], error: "not read yet" };
      let routing = { ok: false, dir: "", groups: [], ceilings: {}, error: "not read yet" };
      try {
        quota = await readQuotas({ gateway: settings.gateway || options.gateway });
      } catch (error) {
        quota = { ok: false, gateway: settings.gateway, rows: [], error: String((error && error.message) || error) };
      }
      try {
        routing = readRouting(options);
      } catch (error) {
        routing = { ok: false, dir: "", groups: [], ceilings: {}, error: String((error && error.message) || error) };
      }
      return {
        codex,
        snapshots: listSnapshots(home),
        settings: { autoRestore: settings.autoRestore, gateway: settings.gateway, lastCheck: settings.lastCheck, lastRestore: settings.lastRestore, log: settings.log },
        quota,
        routing
      };
    }

    async function tick() {
      settings.lastCheck = new Date().toISOString();
      const codex = inspect(home);
      if (settings.autoRestore && codex.mode === "anonymous") {
        const last = settings.lastRestore ? Date.parse(settings.lastRestore.at) : 0;
        if (!last || Date.now() - last > 60000) {
          const pick = newestHealthy(home);
          if (pick) {
            try {
              const done = restoreSnapshot(home, pick.name);
              settings.lastRestore = { at: done.replacedAt, snapshot: pick.name, topKeys: done.topKeys };
              appendLog(settings, "signed-out state found; restored " + pick.name + " (" + done.topKeys + " keys)", "restore");
            } catch (error) {
              appendLog(settings, "restore failed: " + String((error && error.message) || error), "error");
            }
          } else {
            appendLog(settings, "signed-out state found but no healthy snapshot to restore", "error");
          }
        }
      }
      writeSettings(home, settings);
    }

    function body(req) {
      return new Promise((done) => {
        let size = 0;
        const chunks = [];
        req.on("data", (chunk) => {
          size += chunk.length;
          if (size > 65536) {
            req.destroy();
            done(null);
            return;
          }
          chunks.push(chunk);
        });
        req.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8").trim();
          if (!text) return done({});
          try {
            done(JSON.parse(text));
          } catch {
            done(null);
          }
        });
        req.on("error", () => done(null));
      });
    }

    const server = http.createServer(async (req, res) => {
      const host = req.headers.host || "";
      if (!allowedHost(host, boundPort)) return json(res, 403, { error: "invalid host" });
      const opaque = allowOpaqueOrigin(req, res);
      const url = new URL(req.url || "/", "http://" + host);

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        return res.end();
      }

      if (url.pathname === "/_codexguard/health") {
        return json(res, 200, { app: "codex-guard", protocol: 1, port: boundPort });
      }

      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
        let html = "";
        try {
          html = fs.readFileSync(path.join(UI, "index.html"), "utf8");
        } catch {
          return send(res, 500, "text/plain; charset=utf-8", "ui/index.html is missing");
        }
        const csp =
          "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
          "connect-src 'self' http://127.0.0.1:" + boundPort + " http://localhost:" + boundPort + "; base-uri 'none'; form-action 'none'";
        return send(res, 200, TYPES[".html"], html.split("__CODEX_GUARD_TOKEN__").join(token), {
          "content-security-policy": csp,
          "referrer-policy": "no-referrer"
        });
      }

      if (req.method === "GET" && url.pathname.startsWith("/ui/")) {
        const name = path.basename(url.pathname);
        const file = path.join(UI, name);
        try {
          const data = fs.readFileSync(file);
          return send(res, 200, TYPES[path.extname(name)] || "application/octet-stream", data);
        } catch {
          return json(res, 404, { error: "not found" });
        }
      }

      if (url.pathname.startsWith("/api/")) {
        if (!opaque && req.headers.origin && req.headers.origin !== "http://127.0.0.1:" + boundPort) {
          return json(res, 403, { error: "invalid origin" });
        }
        if (req.headers["x-codex-guard-token"] !== token) {
          return json(res, 401, { error: "missing or invalid token" });
        }
        if (req.method === "GET" && url.pathname === "/api/state") {
          return json(res, 200, await snapshotState());
        }
        if (req.method === "POST" && url.pathname === "/api/snapshot") {
          const input = (await body(req)) || {};
          try {
            const row = makeSnapshot(home, String(input.name || snapshotName("snap")), input.label);
            return json(res, 200, { ok: true, snapshot: row, state: await snapshotState() });
          } catch (error) {
            return json(res, 400, { ok: false, error: String((error && error.message) || error) });
          }
        }
        if (req.method === "POST" && url.pathname === "/api/restore") {
          const input = (await body(req)) || {};
          try {
            const done = restoreSnapshot(home, String(input.name || ""));
            return json(res, 200, { ok: true, restored: done, state: await snapshotState() });
          } catch (error) {
            return json(res, 400, { ok: false, error: String((error && error.message) || error) });
          }
        }
        if (req.method === "POST" && url.pathname === "/api/restore-now") {
          const pick = newestHealthy(home);
          if (!pick) return json(res, 400, { ok: false, error: "no healthy snapshot yet; take one while Codex is signed in" });
          try {
            const done = restoreSnapshot(home, pick.name);
            settings.lastRestore = { at: done.replacedAt, snapshot: pick.name, topKeys: done.topKeys };
            appendLog(settings, "restored " + pick.name + " on request (" + done.topKeys + " keys)", "restore");
            writeSettings(home, settings);
            return json(res, 200, { ok: true, restored: done, state: await snapshotState() });
          } catch (error) {
            return json(res, 400, { ok: false, error: String((error && error.message) || error) });
          }
        }
        if (req.method === "POST" && url.pathname === "/api/settings") {
          const input = (await body(req)) || {};
          if (typeof input.autoRestore === "boolean") settings.autoRestore = input.autoRestore;
          if (typeof input.gateway === "string" && input.gateway.trim()) settings.gateway = input.gateway.trim();
          if (typeof input.clearLog === "boolean" && input.clearLog) settings.log = [];
          appendLog(settings, "settings saved (auto restore " + (settings.autoRestore ? "on" : "off") + ")", "settings");
          writeSettings(home, settings);
          return json(res, 200, { ok: true, state: await snapshotState() });
        }
        return json(res, 404, { error: "not found" });
      }

      return json(res, 404, { error: "not found" });
    });

    server.on("error", (error) => {
      server.close();
      reject(error);
    });
    server.listen(port, "127.0.0.1", () => {
      boundPort = server.address().port;
      const timer = setInterval(() => {
        tick().catch(() => {});
      }, 20000);
      timer.unref?.();
      tick().catch(() => {});
      resolve({
        port: boundPort,
        token,
        home,
        close: () => {
          clearInterval(timer);
          server.close();
        }
      });
    });
  });
}
