import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildArmorProfileSourceDetailRows, calculatePiecemealArmorFromPieces, readArmorPiece } from "../scripts/armor.js";
import { breakDownArmorSuitForProfileSlot, previewArmorSuitBreakdownForSlot, resolveArmorProfile, setArmorProfileSlot } from "../scripts/armor-profile.js";
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

function nativeArmorItem(id, name, system = {}, flags = {}) {
  return itemFromDocument({
    _id: id,
    name,
    type: "equipment",
    system: {
      quantity: 1,
      equipped: false,
      carried: true,
      melded: false,
      equipmentType: "armor",
      equipmentSubtype: "mediumArmor",
      slot: "slotless",
      armor: { value: 0, enh: 0, dex: null, acp: 0 },
      spellFailure: 0,
      weight: 0,
      price: 0,
      ...system
    },
    flags
  }, id);
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

function actorWithReorderedCreateResult(items = [], flags = {}) {
  const base = actor(items, flags);
  base.createEmbeddedDocuments = async function createEmbeddedDocuments(_documentName, data) {
    const created = data.map((entry, index) => itemFromDocument(entry, `created-${this.items.length + index}`));
    created.forEach((item) => this.items.push(item));
    return [...created].reverse();
  };
  return base;
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
await setArmorProfileSlot(pieceActor, PACS_EQUIPMENT_SLOTS.legs, "studded-legs");
let resolved = resolveArmorProfile(pieceActor);
assert.equal(resolved.status, "compositeProfile");
assert.equal(resolved.summary.armorBonus, 1);
assert.equal(resolved.pieces[0].name, "[PAcS] Studded Leather, Legs");
assert.equal(pieceActor.items.get("studded-legs").system.slot, PACS_EQUIPMENT_SLOTS.legs);

await assert.rejects(
  () => setArmorProfileSlot(pieceActor, PACS_EQUIPMENT_SLOTS.arms, "studded-legs"),
  /is a Legs armor piece/
);
assert.equal(resolveArmorProfile(pieceActor).profile.slots.legs, "studded-legs");

const nativeDirectActor = actor([nativeArmorItem("native-chainmail", "Chainmail", {
  armor: { value: 5, enh: 0, dex: 2, acp: 5 },
  spellFailure: 30,
  weight: 40,
  price: 150
})]);
assert.equal(previewArmorSuitBreakdownForSlot(nativeDirectActor, "arms", "native-chainmail").canBreak, true);
assert.equal(previewArmorSuitBreakdownForSlot(nativeDirectActor, PACS_EQUIPMENT_SLOTS.torso, "native-chainmail").targetCategory, "torso");
assert.equal(previewArmorSuitBreakdownForSlot(nativeDirectActor, PACS_EQUIPMENT_SLOTS.arms, "native-chainmail").targetCategory, "arms");
assert.equal(previewArmorSuitBreakdownForSlot(nativeDirectActor, PACS_EQUIPMENT_SLOTS.legs, "native-chainmail").targetCategory, "legs");
await assert.rejects(
  () => setArmorProfileSlot(nativeDirectActor, "arms", "native-chainmail"),
  /Break it down into PAcS armor pieces/
);
assert.equal(resolveArmorProfile(nativeDirectActor).status, "empty");

const studdedBreakdownActor = actor([nativeArmorItem("break-studded", "Studded Leather", {
  equipmentSubtype: "lightArmor",
  armor: { value: 3, enh: 0, dex: 5, acp: 1 },
  spellFailure: 15,
  weight: 20,
  price: 25
})]);
const studdedBreakdown = await breakDownArmorSuitForProfileSlot(studdedBreakdownActor, PACS_EQUIPMENT_SLOTS.arms, "break-studded");
assert.equal(studdedBreakdown.breakdown.assignedItemName, "[PAcS] Studded Leather, Arms");
assert.equal(studdedBreakdown.profile.slots.arms, studdedBreakdown.breakdown.assignedItemId);
assert.equal(studdedBreakdownActor.items.some((item) => item.id === "break-studded"), false);
assert.deepEqual(studdedBreakdownActor.items.filter((item) => item.name?.startsWith("[PAcS] Studded Leather")).map((item) => item.name).sort(), [
  "[PAcS] Studded Leather, Arms",
  "[PAcS] Studded Leather, Legs",
  "[PAcS] Studded Leather, Torso"
]);
assert.equal(Boolean(studdedBreakdownActor.items.find((item) => item.name === INTERNAL_ARMOR_PROFILE_NAME)), true);

const reorderedStuddedBreakdownActor = actorWithReorderedCreateResult([nativeArmorItem("break-studded-reordered", "Studded Leather", {
  equipmentSubtype: "lightArmor",
  armor: { value: 3, enh: 0, dex: 5, acp: 1 },
  spellFailure: 15,
  weight: 20,
  price: 25
})]);
const reorderedStuddedBreakdown = await breakDownArmorSuitForProfileSlot(reorderedStuddedBreakdownActor, PACS_EQUIPMENT_SLOTS.arms, "break-studded-reordered");
assert.equal(reorderedStuddedBreakdown.breakdown.assignedItemName, "[PAcS] Studded Leather, Arms");
assert.equal(reorderedStuddedBreakdownActor.items.get(reorderedStuddedBreakdown.profile.slots.arms).system.slot, PACS_EQUIPMENT_SLOTS.arms);

const breakdownActor = actor([nativeArmorItem("break-chainmail", "Chainmail", {
  armor: { value: 5, enh: 2, dex: 2, acp: 5 },
  spellFailure: 30,
  weight: 45,
  price: 300,
  material: { type: "mithral" },
  masterwork: true
})]);
const breakdown = await breakDownArmorSuitForProfileSlot(breakdownActor, PACS_EQUIPMENT_SLOTS.arms, "break-chainmail");
const breakdownPieces = breakdownActor.items.filter((item) => item.name?.startsWith?.("[PAcS] Chainmail"));
assert.equal(breakdownActor.items.some((item) => item.id === "break-chainmail"), false);
assert.deepEqual(breakdownPieces.map((item) => item.name).sort(), [
  "[PAcS] Chainmail, Arms",
  "[PAcS] Chainmail, Legs",
  "[PAcS] Chainmail, Torso"
]);
assert.equal(breakdown.profile.slots.arms, breakdown.breakdown.assignedItemId);
assert.equal(breakdown.profile.slots.torso, null);
assert.equal(breakdown.profile.slots.legs, null);
assert.equal(Math.round(breakdownPieces.reduce((total, item) => total + item.system.price, 0) * 1000) / 1000, 300);
assert.equal(Math.round(breakdownPieces.reduce((total, item) => total + item.system.weight, 0) * 1000) / 1000, 45);
const breakdownArms = breakdownPieces.find((item) => item.name === "[PAcS] Chainmail, Arms");
const breakdownArmsFlag = breakdownArms.getFlag(MODULE_ID, FLAGS.piecemeal);
assert.equal(breakdownArms.system.slot, PACS_EQUIPMENT_SLOTS.arms);
assert.equal(breakdownArmsFlag.enhancementBonus, 2);
assert.equal(breakdownArmsFlag.magicMode, "suit");
assert.equal(breakdownArmsFlag.material, "mithral");
assert.equal(breakdownArmsFlag.masterwork, true);
assert.equal(typeof breakdownArmsFlag.suitId, "string");
assert.ok(breakdownArmsFlag.suitId.length > 0);
let breakdownArmsOnlyResolution = resolveArmorProfile(breakdownActor);
assert.equal(breakdownArmsOnlyResolution.summary.enhancementBonus, 0);
assert.equal(breakdownArmsOnlyResolution.summary.magic.masterworkApplied, false);
const breakdownTorso = breakdownPieces.find((item) => item.name === "[PAcS] Chainmail, Torso");
const breakdownLegs = breakdownPieces.find((item) => item.name === "[PAcS] Chainmail, Legs");
const breakdownSuitIds = new Set(breakdownPieces.map((item) => item.getFlag(MODULE_ID, FLAGS.piecemeal)?.suitId).filter(Boolean));
assert.equal(breakdownSuitIds.size, 1);
await setArmorProfileSlot(breakdownActor, "torso", breakdownTorso.id);
await setArmorProfileSlot(breakdownActor, "legs", breakdownLegs.id);
const fullBreakdownResolution = resolveArmorProfile(breakdownActor);
assert.equal(fullBreakdownResolution.summary.completeSuit, true);
assert.equal(fullBreakdownResolution.summary.enhancementBonus, 2);
assert.equal(buildArmorProfileSourceDetailRows(fullBreakdownResolution.summary).filter((row) => row.source === "enhancement").length, 1);

const masterworkBreakdownActor = actor([nativeArmorItem("break-masterwork-chainmail", "Masterwork Chainmail", {
  armor: { value: 5, enh: 0, dex: 2, acp: 5 },
  spellFailure: 30,
  weight: 40,
  price: 300,
  masterwork: true
})]);
await breakDownArmorSuitForProfileSlot(masterworkBreakdownActor, "arms", "break-masterwork-chainmail");
const masterworkPieces = masterworkBreakdownActor.items.filter((item) => item.name?.startsWith?.("[PAcS] Chainmail"));
const masterworkArms = masterworkPieces.find((item) => item.name === "[PAcS] Chainmail, Arms");
const masterworkTorso = masterworkPieces.find((item) => item.name === "[PAcS] Chainmail, Torso");
const masterworkLegs = masterworkPieces.find((item) => item.name === "[PAcS] Chainmail, Legs");
const masterworkArmsFlag = masterworkArms.getFlag(MODULE_ID, FLAGS.piecemeal);
assert.equal(masterworkArmsFlag.magicMode, "suit");
assert.equal(masterworkArmsFlag.masterwork, true);
breakdownArmsOnlyResolution = resolveArmorProfile(masterworkBreakdownActor);
assert.equal(breakdownArmsOnlyResolution.summary.enhancementBonus, 0);
assert.equal(breakdownArmsOnlyResolution.summary.magic.masterworkApplied, false);
const singleMasterworkAcp = breakdownArmsOnlyResolution.summary.acp;
await setArmorProfileSlot(masterworkBreakdownActor, "torso", masterworkTorso.id);
await setArmorProfileSlot(masterworkBreakdownActor, "legs", masterworkLegs.id);
const fullMasterworkBreakdownResolution = resolveArmorProfile(masterworkBreakdownActor);
assert.equal(fullMasterworkBreakdownResolution.summary.completeSuit, true);
assert.equal(fullMasterworkBreakdownResolution.summary.enhancementBonus, 0);
assert.equal(fullMasterworkBreakdownResolution.summary.magic.masterworkApplied, true);
assert.equal(fullMasterworkBreakdownResolution.summary.acp < singleMasterworkAcp, true);

const quantityActor = actor([nativeArmorItem("stacked-chainmail", "Chainmail", {
  quantity: 2,
  armor: { value: 5, enh: 0, dex: 2, acp: 5 },
  weight: 40,
  price: 150
})]);
await breakDownArmorSuitForProfileSlot(quantityActor, "legs", "stacked-chainmail");
assert.equal(quantityActor.items.get("stacked-chainmail").system.quantity, 1);
assert.equal(quantityActor.items.filter((item) => item.name?.startsWith?.("[PAcS] Chainmail")).length, 3);

const chainShirtMismatchActor = actor([nativeArmorItem("chain-shirt", "Chain Shirt", {
  armor: { value: 4, enh: 0, dex: 4, acp: 2 },
  weight: 25,
  price: 100
})]);
assert.equal(previewArmorSuitBreakdownForSlot(chainShirtMismatchActor, "torso", "chain-shirt").canBreak, false);
assert.equal(previewArmorSuitBreakdownForSlot(chainShirtMismatchActor, "torso", "chain-shirt").reason, "notBreakdownSource");
await assert.rejects(
  () => breakDownArmorSuitForProfileSlot(chainShirtMismatchActor, "arms", "chain-shirt"),
  /not a vanilla full armor suit/
);

const miscNamedChainmailActor = actor([nativeArmorItem("chainmail-polish", "Chainmail Polish", {
  equipmentType: "misc",
  armor: { value: 5, enh: 0, dex: null, acp: 0 },
  weight: 1,
  price: 5
})]);
assert.equal(previewArmorSuitBreakdownForSlot(miscNamedChainmailActor, "arms", "chainmail-polish").canBreak, false);
assert.equal(previewArmorSuitBreakdownForSlot(miscNamedChainmailActor, "arms", "chainmail-polish").reason, "notBreakdownSource");

const customNamedChainmailActor = actor([nativeArmorItem("custom-chainmail", "Chainmail Trophy", {
  armor: { value: 1, enh: 0, dex: null, acp: 0 },
  weight: 5,
  price: 20
})]);
assert.equal(previewArmorSuitBreakdownForSlot(customNamedChainmailActor, "arms", "custom-chainmail").canBreak, false);
assert.equal(previewArmorSuitBreakdownForSlot(customNamedChainmailActor, "arms", "custom-chainmail").reason, "notBreakdownSource");

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
