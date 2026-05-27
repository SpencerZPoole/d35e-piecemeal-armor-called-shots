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
  ["[PAcS] Padded Helmet", ["padded", 1, 1, 1]],
  ["[PAcS] Leather Helmet", ["leather", 2, 2, 1]],
  ["[PAcS] Studded Leather Helmet", ["studded-leather", 3, 2, 3]],
  ["[PAcS] Hide Helmet", ["hide", 3, 3, 2]],
  ["[PAcS] Scale Mail Helmet", ["scale", 4, 3, 5]],
  ["[PAcS] Chain Shirt Coif", ["chain-shirt", 4, 3, 10]],
  ["[PAcS] Chainmail Coif", ["chain", 5, 4, 15]],
  ["[PAcS] Breastplate Helm", ["breastplate", 5, 3, 20]],
  ["[PAcS] Banded Mail Helm", ["banded", 6, 4, 25]],
  ["[PAcS] Splint Mail Helm", ["splint", 6, 5, 20]],
  ["[PAcS] Half-Plate Helm", ["half-plate", 7, 5, 60]],
  ["[PAcS] Full Plate Helm", ["full-plate", 8, 5, 150]]
]);
assert.deepEqual(helmetSource.map((entry) => entry.name).sort(), [...expectedHelmets.keys()].sort());
function assertHelmetMetadata(entry) {
  const [family, localArmor, weight, price] = expectedHelmets.get(entry.name) ?? [];
  const helmetFlag = entry.flags?.[moduleId]?.helmet;
  assert.match(entry.name, /^\[PAcS\] /);
  assert.equal(entry.type, "equipment");
  assert.equal(entry.system?.equipmentType, "misc");
  assert.equal(entry.system?.slot, "head");
  assert.equal(entry.system?.armor?.value, 0);
  assert.equal(entry.system?.armor?.enh, 0);
  assert.equal(entry.system?.weight, weight);
  assert.equal(entry.system?.price, price);
  assert.equal(entry.system?.hp?.max, 10);
  assert.equal(entry.system?.hp?.value, 10);
  assert.equal(entry.system?.hardness, 0);
  assert.equal(entry.system?.quantity, 1);
  assert.equal(entry.system?.identified, true);
  assert.equal(entry.system?.identifiedName, entry.name);
  assert.equal(helmetFlag?.enabled, true);
  assert.equal(helmetFlag?.armorFamily, family);
  assert.equal(helmetFlag?.localArmorBonus, localArmor);
  assert.equal(helmetFlag?.coverageSlots, "head; eyes; ears");
  assert.equal(helmetFlag?.spotPenalty, 0);
  assert.equal(helmetFlag?.listenPenalty, 0);
  assert.match(entry.system?.description?.value ?? "", /editable house-rule inventory values/);
  assert.match(entry.system?.description?.value ?? "", /does not add to normal AC/);
}
for (const entry of helmetSource) assertHelmetMetadata(entry);

async function packedDocumentsFor(pack) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `pacs-${pack.name}-`));
  const tempPackPath = path.join(tempRoot, pack.name);
  try {
    fs.cpSync(path.join(root, pack.path), tempPackPath, { recursive: true });
    const db = new ClassicLevel(tempPackPath, { valueEncoding: "utf8" });
    const packedDocuments = [];
    try {
      await db.open();
      for await (const [_key, value] of db.iterator({ gt: "!items!", lt: "!items!~" })) {
        packedDocuments.push(JSON.parse(value));
      }
      return packedDocuments.sort((a, b) => a.name.localeCompare(b.name));
    } finally {
      if (db.status === "open") await db.close();
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

const { ClassicLevel } = await loadClassicLevel();
try {
  assert.deepEqual((await packedDocumentsFor(featPack)).map((entry) => entry.name).sort(), ["Greater Called Shot", "Improved Called Shot"]);
  const packedHelmets = await packedDocumentsFor(helmetPack);
  assert.deepEqual(packedHelmets.map((entry) => entry.name).sort(), [...expectedHelmets.keys()].sort());
  for (const entry of packedHelmets) assertHelmetMetadata(entry);
} catch (error) {
  if (!["LEVEL_LOCKED", "EPIPE", "EBUSY", "EPERM"].includes(error?.cause?.code) && !["LEVEL_LOCKED", "EPIPE", "EBUSY", "EPERM"].includes(error?.code)) throw error;
  console.warn("test-feat-pack: pack database is locked by live Foundry; source and manifest checks still passed");
}

console.log("test-feat-pack: ok");
