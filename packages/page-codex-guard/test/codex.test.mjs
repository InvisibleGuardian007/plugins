import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inspect, makeSnapshot, restoreSnapshot, listSnapshots, checkName } from "../lib/codex.mjs";

function home() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-guard-"));
  return dir;
}

function writeState(dir, json) {
  fs.writeFileSync(path.join(dir, ".codex-global-state.json"), JSON.stringify(json, null, 2));
}

function healthy() {
  const json = {};
  for (let i = 0; i < 35; i += 1) json["key" + i] = i;
  json["local-projects"] = { a: { name: "Monster-Girl" }, b: { name: "Giantess" } };
  json["thread-project-assignments"] = { t1: "a", t2: "b", t3: "a" };
  json["electron-saved-workspace-roots"] = ["D:/x"];
  json["selected-project"] = "a";
  return json;
}

function anonymous() {
  const json = {};
  for (let i = 0; i < 25; i += 1) json["key" + i] = i;
  return json;
}

test("a signed-in state file is healthy", () => {
  const dir = home();
  writeState(dir, healthy());
  const said = inspect(dir);
  assert.equal(said.mode, "healthy");
  assert.equal(said.projectCount, 2);
  assert.equal(said.assignmentCount, 3);
  assert.ok(said.topKeys >= 35);
});

test("a signed-out state file is anonymous", () => {
  const dir = home();
  writeState(dir, anonymous());
  const said = inspect(dir);
  assert.equal(said.mode, "anonymous");
  assert.equal(said.projectCount, 0);
});

test("a missing state file is reported, not thrown", () => {
  const said = inspect(home());
  assert.equal(said.mode, "missing");
  assert.equal(said.exists, false);
});

test("snapshot then restore puts the projects back", () => {
  const dir = home();
  writeState(dir, healthy());
  makeSnapshot(dir, "good", "while signed in");
  writeState(dir, anonymous());
  assert.equal(inspect(dir).mode, "anonymous");

  const done = restoreSnapshot(dir, "good");
  assert.equal(done.topKeys >= 35, true);
  assert.equal(inspect(dir).mode, "healthy");

  const rows = listSnapshots(dir);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "good");
  assert.equal(rows[0].usable, true);
  assert.ok(fs.existsSync(done.preRestore), "the replaced file is kept");
  assert.equal(inspect(done.preRestore.replace(/\\/g, "/")).mode, "anonymous");
});

test("an anonymous snapshot is refused", () => {
  const dir = home();
  writeState(dir, anonymous());
  makeSnapshot(dir, "bad");
  writeState(dir, healthy());
  assert.throws(() => restoreSnapshot(dir, "bad"), /signed-out/);
  assert.equal(inspect(dir).mode, "healthy");
});

test("snapshot names cannot leave the backup folder", () => {
  assert.throws(() => checkName("../evil"), /snapshot name/);
  assert.throws(() => checkName(""), /snapshot name/);
  const dir = home();
  writeState(dir, healthy());
  assert.throws(() => makeSnapshot(dir, "../evil"), /snapshot name/);
});
