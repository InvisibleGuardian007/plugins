import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(HERE, "..");

function read(name) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

// The frame magpie gives a page has no network and no inline script, so these
// are the rules the page itself could break.
test("the page and its boot script reach no network", () => {
  for (const name of ["page/index.html", "page/boot.js"]) {
    const code = read(name);
    assert.ok(!code.includes("fetch("), name + " must not fetch");
    assert.ok(!code.includes("XMLHttpRequest"), name + " must not use XMLHttpRequest");
    assert.ok(!code.includes("http://") || name === "page/boot.js", name + " must not name an url");
  }
});

test("the page loads the bridge and no inline script", () => {
  const html = read("page/index.html");
  assert.ok(html.includes('src="_magpie/bridge.js"'));
  assert.ok(html.includes('src="boot.js"'));
  assert.ok(!/<script>[^<]/.test(html), "no inline script body");
});

test("the ui talks only to its own service", () => {
  const code = read("ui/app.js");
  assert.ok(code.includes('"/api/state"'), "it calls the state route");
  assert.ok(!code.includes("http://"), "no absolute url");
  assert.ok(!code.includes("https://"), "no absolute url");
  const calls = [...code.matchAll(/fetch\(([^,)]+)/g)].map((m) => m[1].trim());
  assert.deepEqual(calls, ["path"], "every fetch goes through the one helper");
});

test("the manifest declares no permission and a page", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.deepEqual(pkg.magpie.permissions, []);
  assert.equal(pkg.magpie.page.file, "page/index.html");
  assert.ok(pkg.magpie.page.service.port > 1024);
});
