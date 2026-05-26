import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(root, "module.json"), "utf8"));
const source = JSON.parse(fs.readFileSync(path.join(root, "data", "called-shot-feats.json"), "utf8"));
const pack = manifest.packs?.find((entry) => entry.name === "called-shot-feats");

function classicLevelCandidates() {
  const candidates = [];
  if (process.env.FOUNDRY_CLASSIC_LEVEL) candidates.push(process.env.FOUNDRY_CLASSIC_LEVEL);
  if (process.env.PROGRAMFILES) {
    candidates.push(path.join(process.env.PROGRAMFILES, "Foundry Virtual Tabletop", "resources", "app", "node_modules", "classic-level", "index.js"));
  }
  return candidates;
}

async function loadClassicLevel() {
  try {
    return await import("classic-level");
  } catch (_error) {
    for (const candidate of classicLevelCandidates()) {
      if (fs.existsSync(candidate)) return import(pathToFileURL(candidate));
    }
  }
  throw new Error("classic-level was not found. Set FOUNDRY_CLASSIC_LEVEL to Foundry's classic-level index.js.");
}

assert.equal(pack?.label, "PAcS Called-Shot Feats");
assert.equal(pack?.type, "Item");
assert.equal(pack?.system, "D35E");
assert.equal(pack?.path, "packs/called-shot-feats");
assert.equal(fs.existsSync(path.join(root, pack.path, "CURRENT")), true);

const names = source.map((entry) => entry.name).sort();
assert.deepEqual(names, ["Greater Called Shot", "Improved Called Shot"]);
for (const entry of source) {
  assert.equal(entry.type, "feat");
  assert.equal(entry.img, "systems/D35E/icons/feats/feat-generic.png");
  assert.equal(entry.flags?.["d35e-piecemeal-armor-called-shots"]?.calledShotFeat, true);
  assert.equal(entry.flags?.["d35e-piecemeal-armor-called-shots"]?.detectsByName, true);
  assert.match(entry.system?.description?.value ?? "", /detects this exact feat name/);
  assert.match(entry.system?.description?.value ?? "", /not D&D 3\.5 rules as written/);
}

const { ClassicLevel } = await loadClassicLevel();
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pacs-feat-pack-"));
const tempPackPath = path.join(tempRoot, "called-shot-feats");
try {
  fs.cpSync(path.join(root, pack.path), tempPackPath, { recursive: true });
  const db = new ClassicLevel(tempPackPath, { valueEncoding: "utf8" });
  const packedNames = [];
  try {
    await db.open();
    for await (const [_key, value] of db.iterator({ gt: "!items!", lt: "!items!~" })) {
      packedNames.push(JSON.parse(value).name);
    }
    assert.deepEqual(packedNames.sort(), ["Greater Called Shot", "Improved Called Shot"]);
  } finally {
    if (db.status === "open") await db.close();
  }
} catch (error) {
  if (!["LEVEL_LOCKED", "EPIPE", "EBUSY", "EPERM"].includes(error?.cause?.code) && !["LEVEL_LOCKED", "EPIPE", "EBUSY", "EPERM"].includes(error?.code)) throw error;
  console.warn("test-feat-pack: pack database is locked by live Foundry; source and manifest checks still passed");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("test-feat-pack: ok");
