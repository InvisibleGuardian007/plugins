import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function magpieDir(options) {
  const given = String((options && options.configDir) || process.env.MAGPIE_CONFIG_DIR || "").trim();
  return given || path.join(os.homedir(), ".config", "magpie");
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

// Read-only view of what magpie will do with a codex request: the group's
// routing, whether a turn sticks to the account that served it, and the
// ceiling the reserve middleware was given. The page explains the ceiling's
// meaning because "used 99%" and "keep 1%" are the same number read two ways.
export function readRouting(options) {
  const dir = magpieDir(options);
  const providers = readJson(path.join(dir, "providers.json"));
  const plugins = readJson(path.join(dir, "plugins.json"));
  if (!providers) {
    return { ok: false, dir, groups: [], error: "providers.json is not readable", ceilings: {} };
  }
  const groups = Array.isArray(providers.groups) ? providers.groups : [];
  const ceilings = {};
  const list = Array.isArray(plugins && plugins.plugins) ? plugins.plugins : [];
  for (const item of list) {
    // plugins.json names a package by its spec, not by a name field.
    const name = String((item && (item.name || item.spec)) || "");
    if (name.includes("middleware-reserve") && item && item.options && item.options.ceiling !== undefined) {
      ceilings["@magpie-community/middleware-reserve"] = Number(item.options.ceiling);
    }
  }
  const rows = groups.map((group) => {
    const members = Array.isArray(group.members) ? group.members : [];
    return {
      id: String(group.id || group.name || ""),
      name: String(group.name || group.id || ""),
      routing: String(group.routing || ""),
      affinity: String(group.affinity || group.stays || ""),
      classifier: group.classifier ? String(group.classifier) : "",
      members: members.map((m) => (typeof m === "string" ? m : String((m && (m.provider + "/" + m.model)) || ""))).filter(Boolean),
      rules: Array.isArray(group.rules) ? group.rules.length : 0
    };
  });
  const codexGroups = rows.filter((row) => row.members.some((m) => m.startsWith("codex/")));
  return {
    ok: true,
    dir,
    ceilings,
    groups: codexGroups.length ? codexGroups : rows.slice(0, 4),
    error: null
  };
}
