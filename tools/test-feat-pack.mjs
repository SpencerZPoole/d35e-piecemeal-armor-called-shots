import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(root, "module.json"), "utf8"));
const featSource = JSON.parse(fs.readFileSync(path.join(root, "data", "called-shot-feats.json"), "utf8"));
const helmetSource = JSON.parse(fs.readFileSync(path.join(root, "data", "helmets.json"), "utf8"));
const featPack = manifest.packs?.find((entry) => entry.name === "called-shot-feats");
const helmetPack = manifest.packs?.find((entry) => entry.name === "helmets");
const moduleId = "d35e-piecemeal-armor-called-shots";

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

assert.equal(featPack?.label, "PAcS Called-Shot Feats");
assert.equal(featPack?.type, "Item");
assert.equal(featPack?.system, "D35E");
assert.equal(featPack?.path, "packs/called-shot-feats");
assert.equal(fs.existsSync(path.join(root, featPack.path, "CURRENT")), true);
assert.equal(helmetPack?.label, "PAcS Helmets");
assert.equal(helmetPack?.type, "Item");
assert.equal(helmetPack?.system, "D35E");
assert.equal(helmetPack?.path, "packs/helmets");
assert.equal(fs.existsSync(path.join(root, helmetPack.path, "CURRENT")), true);

const names = featSource.map((entry) => entry.name).sort();
assert.deepEqual(names, ["Greater Called Shot", "Improved Called Shot"]);
for (const entry of featSource) {
  assert.equal(entry.type, "feat");
  assert.equal(entry.img, "systems/D35E/icons/feats/feat-generic.png");
  assert.equal(entry.flags?.[moduleId]?.calledShotFeat, true);
  assert.equal(entry.flags?.[moduleId]?.detectsByName, true);
  assert.match(entry.system?.description?.value ?? "", /detects this exact feat name/);
  assert.match(entry.system?.description?.value ?? "", /not D&D 3\.5 rules as written/);
}

const expectedHelmets = new Map([
  ["Padded Helmet", ["padded", 1]],
  ["Leather Helmet", ["leather", 2]],
  ["Studded Leather Helmet", ["studded-leather", 3]],
  ["Hide Helmet", ["hide", 3]],
  ["Scale Mail Helmet", ["scale", 4]],
  ["Chain Shirt Coif", ["chain-shirt", 4]],
  ["Chainmail Coif", ["chain", 5]],
  ["Breastplate Helm", ["breastplate", 5]],
  ["Banded Mail Helm", ["banded", 6]],
  ["Splint Mail Helm", ["splint", 6]],
  ["Half-Plate Helm", ["half-plate", 7]],
  ["Full Plate Helm", ["full-plate", 8]]
]);
assert.deepEqual(helmetSource.map((entry) => entry.name).sort(), [...expectedHelmets.keys()].sort());
for (const entry of helmetSource) {
  const [family, localArmor] = expectedHelmets.get(entry.name) ?? [];
  const helmetFlag = entry.flags?.[moduleId]?.helmet;
  assert.equal(entry.type, "equipment");
  assert.equal(entry.system?.equipmentType, "misc");
  assert.equal(entry.system?.slot, "head");
  assert.equal(entry.system?.armor?.value, 0);
  assert.equal(entry.system?.armor?.enh, 0);
  assert.equal(entry.system?.weight, 0);
  assert.equal(helmetFlag?.enabled, true);
  assert.equal(helmetFlag?.armorFamily, family);
  assert.equal(helmetFlag?.localArmorBonus, localArmor);
  assert.equal(helmetFlag?.coverageSlots, "head; eyes; ears");
  assert.equal(helmetFlag?.spotPenalty, 0);
  assert.equal(helmetFlag?.listenPenalty, 0);
  assert.match(entry.system?.description?.value ?? "", /does not add to normal AC/);
}

async function packedNamesFor(pack) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `pacs-${pack.name}-`));
  const tempPackPath = path.join(tempRoot, pack.name);
  try {
    fs.cpSync(path.join(root, pack.path), tempPackPath, { recursive: true });
    const db = new ClassicLevel(tempPackPath, { valueEncoding: "utf8" });
    const packedNames = [];
    try {
      await db.open();
      for await (const [_key, value] of db.iterator({ gt: "!items!", lt: "!items!~" })) {
        packedNames.push(JSON.parse(value).name);
      }
      return packedNames.sort();
    } finally {
      if (db.status === "open") await db.close();
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

const { ClassicLevel } = await loadClassicLevel();
try {
  assert.deepEqual(await packedNamesFor(featPack), ["Greater Called Shot", "Improved Called Shot"]);
  assert.deepEqual(await packedNamesFor(helmetPack), [...expectedHelmets.keys()].sort());
} catch (error) {
  if (!["LEVEL_LOCKED", "EPIPE", "EBUSY", "EPERM"].includes(error?.cause?.code) && !["LEVEL_LOCKED", "EPIPE", "EBUSY", "EPERM"].includes(error?.code)) throw error;
  console.warn("test-feat-pack: pack database is locked by live Foundry; source and manifest checks still passed");
}

console.log("test-feat-pack: ok");
