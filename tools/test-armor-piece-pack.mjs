import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { calculatePiecemealArmorFromPieces, readArmorPiece } from "../scripts/armor.js";
import { resolveArmorProfile, setArmorProfileSlot } from "../scripts/armor-profile.js";
import { FLAGS, INTERNAL_ARMOR_PROFILE_NAME, MODULE_ID, PACS_EQUIPMENT_SLOTS } from "../scripts/constants.js";
import { buildArmorPiecePackDocuments, expectedArmorPieceNames } from "./armor-piece-pack-documents.mjs";

const root = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(root, "module.json"), "utf8"));
const pack = manifest.packs?.find((entry) => entry.name === "armor-pieces");

globalThis.game = {
  settings: {
    get(moduleId, key) {
      assert.equal(moduleId, MODULE_ID);
      if (key === "enableArmorAutomation") return true;
      if (key === "armorWorkflowMode") return "nativeProfile";
      if (key === "rulesMode") return "rawAdapted";
      return true;
    }
  }
};

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

function setPath(target, path, value) {
  const parts = path.split(".");
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    cursor[part] = cursor[part] ?? {};
    cursor = cursor[part];
  }
  cursor[parts.at(-1)] = value;
}

function applyUpdate(document, update) {
  for (const [updatePath, value] of Object.entries(update)) setPath(document, updatePath, value);
}

function itemFromDocument(document, id = document._id) {
  return {
    ...structuredClone(document),
    id,
    getFlag(moduleId, key) {
      return this.flags?.[moduleId]?.[key];
    },
    async unsetFlag(moduleId, key) {
      if (this.flags?.[moduleId]) delete this.flags[moduleId][key];
    },
    async update(update) {
      applyUpdate(this, update);
      return this;
    }
  };
}

function actor(items = [], flags = {}) {
  items.get = (id) => items.find((item) => item.id === id) ?? null;
  return {
    id: "actor-armor-piece-pack",
    items,
    flags,
    refreshCount: 0,
    getFlag(moduleId, key) {
      return this.flags?.[moduleId]?.[key];
    },
    async setFlag(moduleId, key, value) {
      this.flags[moduleId] = this.flags[moduleId] ?? {};
      this.flags[moduleId][key] = value;
      return value;
    },
    async unsetFlag(moduleId, key) {
      if (this.flags?.[moduleId]) delete this.flags[moduleId][key];
    },
    async createEmbeddedDocuments(_documentName, data) {
      const created = data.map((entry, index) => itemFromDocument(entry, `created-${this.items.length + index}`));
      created.forEach((item) => this.items.push(item));
      return created;
    },
    async deleteEmbeddedDocuments(_documentName, ids) {
      for (const id of ids) {
        const index = this.items.findIndex((item) => item.id === id);
        if (index >= 0) this.items.splice(index, 1);
      }
    },
    async refresh(options = {}) {
      this.refreshCount += 1;
      this.lastRefreshOptions = options;
      return this;
    }
  };
}

function byName(documents, name) {
  const document = documents.find((entry) => entry.name === name);
  assert.ok(document, `Missing armor piece pack item: ${name}`);
  return document;
}

function assertShippedEquipmentMetadata(entry) {
  assert.match(entry.name, /^\[PAcS\] /);
  assert.equal(entry.type, "equipment");
  assert.equal(typeof entry.system?.description?.value, "string");
  assert.ok(entry.system.description.value.length > 0);
  assert.equal(Number.isFinite(entry.system?.weight), true);
  assert.equal(Number.isFinite(entry.system?.price), true);
  assert.equal(entry.system?.hp?.max, 10);
  assert.equal(entry.system?.hp?.value, 10);
  assert.equal(entry.system?.hardness, 0);
  assert.equal(entry.system?.quantity, 1);
  assert.equal(entry.system?.identified, true);
  assert.equal(entry.system?.identifiedName, entry.name);
}

function d35eInventoryValue(items) {
  return items.reduce((total, item) => {
    const quantity = item.system?.quantity ?? 1;
    const price = item.system?.identified === false
      ? item.system?.unidentified?.price ?? item.system?.price ?? 0
      : item.system?.price ?? 0;
    return total + price * quantity;
  }, 0);
}

assert.equal(pack?.label, "PAcS Armor Pieces");
assert.equal(pack?.type, "Item");
assert.equal(pack?.system, "D35E");
assert.equal(pack?.path, "packs/armor-pieces");
assert.equal(fs.existsSync(path.join(root, pack.path, "CURRENT")), true);

const documents = buildArmorPiecePackDocuments();
assert.deepEqual(documents.map((entry) => entry.name).sort(), expectedArmorPieceNames().sort());

for (const entry of documents) assertShippedEquipmentMetadata(entry);

for (const expectedName of [
  "[PAcS] Studded Leather, Torso",
  "[PAcS] Studded Leather, Arms",
  "[PAcS] Studded Leather, Legs",
  "[PAcS] Full Plate, Torso",
  "[PAcS] Full Plate, Arms",
  "[PAcS] Full Plate, Legs",
  "[PAcS] Half-Plate, Legs",
  "[PAcS] Breastplate, Torso",
  "[PAcS] Chain Shirt, Torso",
  "[PAcS] Chainmail, Torso"
]) {
  byName(documents, expectedName);
}

const studdedLegs = byName(documents, "[PAcS] Studded Leather, Legs");
const studdedLegsFlag = studdedLegs.flags?.[MODULE_ID]?.piecemeal;
assert.equal(studdedLegs.type, "equipment");
assert.equal(studdedLegs.system?.equipmentType, "misc");
assert.equal(studdedLegs.system?.slot, "slotless");
assert.equal(studdedLegs.system?.armor?.value, 0);
assert.equal(studdedLegs.system?.weight, 3);
assert.equal(studdedLegsFlag?.enabled, true);
assert.equal(studdedLegsFlag?.catalogId, "studded-leather-legs");
assert.equal(studdedLegsFlag?.pieceCategory, "legs");
assert.equal(studdedLegsFlag?.armorFamily, "studded-leather");
assert.equal(studdedLegsFlag?.armorBonus, 1);
assert.equal(studdedLegsFlag?.maxDex, 5);
assert.equal(studdedLegsFlag?.acp, 0);
assert.equal(studdedLegsFlag?.spellFailure, 10);
assert.match(studdedLegs.system?.description?.value ?? "", /Drag it to <strong>PAcS: Legs<\/strong>/);
assert.match(studdedLegs.system?.description?.value ?? "", /does not change AC/);

const fullPlateTorso = byName(documents, "[PAcS] Full Plate, Torso");
assert.equal(fullPlateTorso.flags?.[MODULE_ID]?.piecemeal?.catalogId, "plate-torso");
assert.equal(fullPlateTorso.flags?.[MODULE_ID]?.piecemeal?.armorBonus, 5);
const halfPlateLegs = byName(documents, "[PAcS] Half-Plate, Legs");
assert.equal(halfPlateLegs.flags?.[MODULE_ID]?.piecemeal?.catalogId, "chain-legs");
assert.equal(halfPlateLegs.flags?.[MODULE_ID]?.piecemeal?.armorFamily, "chain");
const breastplateTorso = byName(documents, "[PAcS] Breastplate, Torso");
assert.equal(breastplateTorso.flags?.[MODULE_ID]?.piecemeal?.catalogId, "plate-torso");
const chainShirtTorso = byName(documents, "[PAcS] Chain Shirt, Torso");
assert.equal(chainShirtTorso.flags?.[MODULE_ID]?.piecemeal?.catalogId, "chain-shirt-torso");
assert.equal(calculatePiecemealArmorFromPieces([readArmorPiece(itemFromDocument(studdedLegs))]).armorBonus, 1);

const pieceActor = actor([itemFromDocument(studdedLegs, "studded-legs")]);
await setArmorProfileSlot(pieceActor, "legs", "studded-legs");
let resolved = resolveArmorProfile(pieceActor);
assert.equal(resolved.status, "compositeProfile");
assert.equal(resolved.summary.armorBonus, 1);
assert.equal(resolved.pieces[0].name, "[PAcS] Studded Leather, Legs");
assert.equal(pieceActor.items.get("studded-legs").system.slot, PACS_EQUIPMENT_SLOTS.legs);

await assert.rejects(
  () => setArmorProfileSlot(pieceActor, "arms", "studded-legs"),
  /is a Legs armor piece/
);
assert.equal(resolveArmorProfile(pieceActor).profile.slots.legs, "studded-legs");

const chainmailBaseline = itemFromDocument(byName(documents, "[PAcS] Chainmail, Torso"), "chainmail-torso");
const chainmailArms = itemFromDocument(byName(documents, "[PAcS] Chainmail, Arms"), "chainmail-arms");
const profileActor = actor([chainmailBaseline, chainmailArms]);
await setArmorProfileSlot(profileActor, "torso", "chainmail-torso");
await setArmorProfileSlot(profileActor, "arms", "chainmail-arms");
resolved = resolveArmorProfile(profileActor);
assert.equal(resolved.summary.armorBonus, 4);
assert.equal(resolved.summary.activePieces.map((piece) => piece.name).join("|"), "[PAcS] Chainmail, Torso|[PAcS] Chainmail, Arms");

const scaleArms = itemFromDocument(byName(documents, "[PAcS] Scale Mail, Arms"), "scale-arms");
const scaleLegs = itemFromDocument(byName(documents, "[PAcS] Scale Mail, Legs"), "scale-legs");
const scaleTorso = itemFromDocument(byName(documents, "[PAcS] Scale Mail, Torso"), "scale-torso");
const scaleActor = actor([scaleArms, scaleLegs]);
await setArmorProfileSlot(scaleActor, "arms", "scale-arms");
await setArmorProfileSlot(scaleActor, "legs", "scale-legs");
const scaleValueBeforeTorso = d35eInventoryValue(scaleActor.items);
scaleActor.items.push(scaleTorso);
await setArmorProfileSlot(scaleActor, "torso", "scale-torso");
const scaleCarrier = scaleActor.items.find((item) => item.name === INTERNAL_ARMOR_PROFILE_NAME);
assert.equal(Boolean(scaleCarrier), true);
assert.equal(scaleArms.system.price, 10);
assert.equal(scaleLegs.system.price, 10);
assert.equal(scaleTorso.system.price, 30);
assert.equal(scaleCarrier.system.price, 0);
assert.equal(scaleCarrier.getFlag(MODULE_ID, FLAGS.aggregate).summary.cost, 50);
assert.equal(d35eInventoryValue(scaleActor.items), 50);
assert.equal(d35eInventoryValue(scaleActor.items) - scaleValueBeforeTorso, 30);

async function packedDocumentsFor(packEntry) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pacs-armor-pieces-"));
  const tempPackPath = path.join(tempRoot, packEntry.name);
  try {
    fs.cpSync(path.join(root, packEntry.path), tempPackPath, { recursive: true });
    const { ClassicLevel } = await loadClassicLevel();
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

try {
  const packedDocuments = await packedDocumentsFor(pack);
  assert.deepEqual(packedDocuments.map((entry) => entry.name).sort(), expectedArmorPieceNames().sort());
  for (const entry of packedDocuments) assertShippedEquipmentMetadata(entry);
} catch (error) {
  if (!["LEVEL_LOCKED", "EPIPE", "EBUSY", "EPERM"].includes(error?.cause?.code) && !["LEVEL_LOCKED", "EPIPE", "EBUSY", "EPERM"].includes(error?.code)) throw error;
  console.warn("test-armor-piece-pack: pack database is locked by live Foundry; generated document and manifest checks still passed");
}

console.log("test-armor-piece-pack: ok");
