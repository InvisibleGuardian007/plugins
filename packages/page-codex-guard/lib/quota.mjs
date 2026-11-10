// The page cannot reach the network on its own, so its host reads magpie's
// own quota API. A gateway that is not there is normal (magpie may be started
// without one), and is reported rather than thrown.
export async function readQuotas(options) {
  const base = String((options && options.gateway) || "http://127.0.0.1:3425").trim().replace(/\/+$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(base + "/v1/magpie/quotas?kept=1", {
      headers: { accept: "application/json" },
      signal: controller.signal
    });
    if (!res.ok) return { ok: false, gateway: base, rows: [], error: "HTTP " + res.status };
    const json = await res.json();
    const data = Array.isArray(json && json.data) ? json.data : Array.isArray(json) ? json : [];
    return { ok: true, gateway: base, rows: data.map(normalize).filter(Boolean), error: null };
  } catch (error) {
    return { ok: false, gateway: base, rows: [], error: String((error && error.message) || error) };
  } finally {
    clearTimeout(timer);
  }
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalize(row) {
  if (!row || typeof row !== "object") return null;
  const windows = Array.isArray(row.windows)
    ? row.windows.map((w) => ({
        name: String((w && w.name) || ""),
        used: num(w && w.used),
        remaining: num(w && w.remaining),
        resetsAt: (w && w.resetsAt) || null
      }))
    : [];
  return {
    provider: String(row.provider || ""),
    name: String(row.name || ""),
    plan: row.plan ? String(row.plan) : "",
    user: row.user ? String(row.user) : "",
    windows,
    resets: num(row.resets && row.resets.count),
    error: row.error ? String(row.error) : null,
    readAt: row.readAt || null
  };
}

// The tighter of the two windows is what a routing ceiling is measured
// against, so the page shows both and marks the one in force.
export function codexRows(quotas) {
  const rows = (quotas && quotas.rows) || [];
  return rows.filter((row) => row.provider === "codex");
}
