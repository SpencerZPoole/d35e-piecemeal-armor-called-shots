import assert from "node:assert/strict";
import {
  buildAggregateItemData,
  buildArmorProfileSourceDetailRows,
  buildNeutralizeUpdate,
  buildRestoreUpdate,
  calculatePiecemealArmor,
  calculatePiecemealArmorFromPieces,
  inferSyncedComponentVisualSlot,
  previewArmorSync,
  RAW_ARMOR_PIECE_CATALOG,
  RAW_ARMOR_SUIT_CATALOG,
  syncArmorAggregate
} from "../scripts/armor.js";

const MODULE_ID = "d35e-piecemeal-armor-called-shots";

function item(id, name, piece, system = {}) {
  return {
    id,
    name,
    type: "equipment",
    system: {
      equipped: true,
      melded: false,
      equipmentSubtype: "lightArmor",
      armor: { value: 0, enh: 0, dex: null, acp: 0 },
      spellFailure: 0,
      slot: "armor",
      ...system
    },
    flags: {
      [MODULE_ID]: {
        piecemeal: piece
      }
    }
  };
}

const torso = item("a", "Torso plates", {
  enabled: true,
  slot: "torso",
  armorBonus: 3,
  enhancementBonus: 1,
  maxDex: 4,
  acp: 2,
  spellFailure: 15,
  equipmentSubtype: "mediumArmor",
  weight: 12
});
const arms = item("b", "Arm guards", {
  enabled: true,
  slot: "arms",
  armorBonus: 1,
  maxDex: 6,
  acp: 1,
  spellFailure: 5,
  equipmentSubtype: "lightArmor",
  weight: 3
});
const ignored = item("c", "Backpack", { enabled: false });

const plateTorsoCatalog = RAW_ARMOR_PIECE_CATALOG.find((entry) => entry.id === "plate-torso");
assert.equal(plateTorsoCatalog.pieceCategory, "torso");
assert.equal(plateTorsoCatalog.armorBonus, 5);
assert.equal(plateTorsoCatalog.coverageSlots.includes("heart"), true);

function catalog(id) {
  const entry = RAW_ARMOR_PIECE_CATALOG.find((piece) => piece.id === id);
  assert.ok(entry, `Missing catalog entry: ${id}`);
  return entry;
}

function catalogSuit(suitId) {
  const suit = RAW_ARMOR_SUIT_CATALOG.find((entry) => entry.id === suitId);
  assert.ok(suit, `Missing suit catalog entry: ${suitId}`);
  return Object.values(suit.pieceIds).map((id) => catalog(id));
}

const d35eCalibratedSuits = [
  ["padded", 1],
  ["leather", 2],
  ["studded-leather", 3],
  ["hide", 3],
  ["scale", 4],
  ["chain", 5],
  ["banded", 6],
  ["splint", 6],
  ["half-plate", 7],
  ["full-plate", 8]
];
for (const [suitId, targetArmorBonus] of d35eCalibratedSuits) {
  const suitSummary = calculatePiecemealArmorFromPieces(catalogSuit(suitId));
  assert.equal(suitSummary.completeSuit, true, `${suitId} should resolve as a full PAcS suit`);
  assert.equal(suitSummary.suitArmorBonus, 1, `${suitId} should include the full-suit +1`);
  assert.equal(suitSummary.armorBonus, targetArmorBonus, `${suitId} should match the D&D 3.5 armor bonus`);
}
const chainShirtCatalog = calculatePiecemealArmorFromPieces(catalogSuit("chain-shirt"));
assert.equal(chainShirtCatalog.completeSuit, false);
assert.equal(chainShirtCatalog.armorBonus, 4);
const breastplateCatalog = calculatePiecemealArmorFromPieces(catalogSuit("breastplate"));
assert.equal(breastplateCatalog.completeSuit, false);
assert.equal(breastplateCatalog.armorBonus, 5);

assert.deepEqual(
  ["studded-leather-arms", "studded-leather-legs", "studded-leather-torso"].map((id) => {
    const piece = catalog(id);
    return {
      id,
      armorBonus: piece.armorBonus,
      maxDex: piece.maxDex,
      acp: piece.acp,
      spellFailure: piece.spellFailure,
      weight: piece.weight,
      cost: piece.cost
    };
  }),
  [
    { id: "studded-leather-arms", armorBonus: 0, maxDex: 5, acp: 0, spellFailure: 15, weight: 2, cost: 5 },
    { id: "studded-leather-legs", armorBonus: 1, maxDex: 5, acp: 0, spellFailure: 10, weight: 3, cost: 5 },
    { id: "studded-leather-torso", armorBonus: 1, maxDex: 5, acp: 0, spellFailure: 15, weight: 15, cost: 15 }
  ]
);
assert.deepEqual(
  ["chain-arms", "chain-legs", "chain-torso", "chain-shirt-torso"].map((id) => {
    const piece = catalog(id);
    return {
      id,
      armorBonus: piece.armorBonus,
      maxDex: piece.maxDex,
      acp: piece.acp,
      spellFailure: piece.spellFailure,
      weight: piece.weight,
      cost: piece.cost
    };
  }),
  [
    { id: "chain-arms", armorBonus: 1, maxDex: 2, acp: 3, spellFailure: 30, weight: 5, cost: 25 },
    { id: "chain-legs", armorBonus: 0, maxDex: 2, acp: 2, spellFailure: 15, weight: 10, cost: 25 },
    { id: "chain-torso", armorBonus: 3, maxDex: 4, acp: 2, spellFailure: 30, weight: 25, cost: 100 },
    { id: "chain-shirt-torso", armorBonus: 4, maxDex: 4, acp: 2, spellFailure: 30, weight: 25, cost: 100 }
  ]
);
assert.deepEqual(
  ["plate-arms", "plate-legs", "plate-torso"].map((id) => {
    const piece = catalog(id);
    return {
      id,
      armorBonus: piece.armorBonus,
      maxDex: piece.maxDex,
      acp: piece.acp,
      spellFailure: piece.spellFailure,
      weight: piece.weight,
      cost: piece.cost
    };
  }),
  [
    { id: "plate-arms", armorBonus: 1, maxDex: 1, acp: 7, spellFailure: 35, weight: 10, cost: 375 },
    { id: "plate-legs", armorBonus: 1, maxDex: 1, acp: 3, spellFailure: 20, weight: 10, cost: 925 },
    { id: "plate-torso", armorBonus: 5, maxDex: 3, acp: 4, spellFailure: 35, weight: 30, cost: 200 }
  ]
);

const summary = calculatePiecemealArmor([torso, arms, ignored]);
assert.equal(summary.armorBonus, 4);
assert.equal(summary.enhancementBonus, 1);
assert.equal(summary.maxDex, 4);
assert.equal(summary.acp, 1);
assert.equal(summary.spellFailure, 15);
assert.equal(summary.equipmentSubtype, "mediumArmor");
assert.equal(summary.weight, 15);
assert.deepEqual(summary.componentIds, ["a", "b"]);

const legacySummary = calculatePiecemealArmor([torso, arms, ignored], { rulesMode: "legacyWorkflow" });
assert.equal(legacySummary.acp, 3);
assert.equal(legacySummary.spellFailure, 20);

const unequippedHelmet = item("d", "Helmet", {
  enabled: true,
  slot: "head",
  armorBonus: 2,
  equipmentSubtype: "lightArmor"
}, {
  equipped: false,
  carried: true,
  equipmentType: "miscellaneous",
  slot: "head"
});
const notCarried = item("e", "Dropped vambrace", {
  enabled: true,
  slot: "arms",
  armorBonus: 1
}, { equipped: false, carried: false });
const melded = item("f", "Melded plate", {
  enabled: true,
  slot: "torso",
  armorBonus: 5
}, { equipped: false, melded: true });
const broken = item("g", "Broken guard", {
  enabled: true,
  slot: "arms",
  armorBonus: 1
}, { equipped: false, broken: true });
const moduleManaged = calculatePiecemealArmor([unequippedHelmet, notCarried, melded, broken]);
assert.equal(moduleManaged.armorBonus, 2);
assert.deepEqual(moduleManaged.componentIds, ["d"]);
assert.equal(moduleManaged.equipmentSubtype, "lightArmor");
assert.equal(calculatePiecemealArmor([unequippedHelmet], { equippedOnly: true }).armorBonus, 0);

const aggregate = buildAggregateItemData(summary);
assert.equal(aggregate.name, "Piecemeal Armor Aggregate");
assert.equal(aggregate.system.armor.value, 4);
assert.equal(aggregate.system.armor.enh, 1);
assert.equal(aggregate.system.armor.dex, 4);
assert.equal(aggregate.system.armor.acp, -1);
assert.equal(aggregate.system.weight, 0);
assert.equal(aggregate.flags[MODULE_ID].aggregate.summary.weight, 15);

const singleArmPiece = calculatePiecemealArmorFromPieces([catalog("chain-arms")]);
assert.equal(singleArmPiece.completeSuit, false);
assert.equal(singleArmPiece.armorBonus, 1);
assert.equal(singleArmPiece.maxDex, 2);
assert.equal(singleArmPiece.acp, 3);
assert.equal(singleArmPiece.spellFailure, 30);
assert.equal(singleArmPiece.weight, 5);
assert.equal(singleArmPiece.cost, 25);

const partialMixedSuit = calculatePiecemealArmorFromPieces([catalog("chain-torso"), catalog("studded-leather-legs")]);
assert.equal(partialMixedSuit.completeSuit, false);
assert.equal(partialMixedSuit.mixedSuit, false);
assert.equal(partialMixedSuit.armorBonus, 4);
assert.equal(partialMixedSuit.spellFailure, 30);
assert.equal(partialMixedSuit.mixedSuitSpellFailurePenalty, 0);

const studdedSuit = calculatePiecemealArmorFromPieces([
  catalog("studded-leather-torso"),
  catalog("studded-leather-arms"),
  catalog("studded-leather-legs")
]);
assert.equal(studdedSuit.completeSuit, true);
assert.equal(studdedSuit.mixedSuit, false);
assert.equal(studdedSuit.armorBonus, 3);
assert.equal(studdedSuit.suitArmorBonus, 1);
assert.equal(studdedSuit.maxDex, 5);
assert.equal(studdedSuit.acp, 0);
assert.equal(studdedSuit.spellFailure, 15);
assert.equal(studdedSuit.weight, 20);
assert.equal(studdedSuit.cost, 25);

const chainSuit = calculatePiecemealArmorFromPieces([
  catalog("chain-torso"),
  catalog("chain-arms"),
  catalog("chain-legs")
]);
assert.equal(chainSuit.completeSuit, true);
assert.equal(chainSuit.armorBonus, 5);
assert.equal(chainSuit.maxDex, 2);
assert.equal(chainSuit.acp, 3);
assert.equal(chainSuit.spellFailure, 30);
assert.equal(chainSuit.weight, 40);
assert.equal(chainSuit.cost, 150);
assert.equal(chainSuit.equipmentSubtype, "mediumArmor");

const fullSuit = calculatePiecemealArmor([
  item("suit-torso", "Torso", { enabled: true, pieceCategory: "torso", coverageSlots: "torso", armorFamily: "plate", armorBonus: 6, acp: 4, spellFailure: 35, weight: 30 }),
  item("suit-legs", "Legs", { enabled: true, pieceCategory: "legs", coverageSlots: "legs", armorFamily: "plate", armorBonus: 2, acp: 3, spellFailure: 20, weight: 15 }),
  item("suit-arms", "Arms", { enabled: true, pieceCategory: "arms", coverageSlots: "arms", armorFamily: "plate", armorBonus: 1, acp: 2, spellFailure: 25, weight: 10 })
]);
assert.equal(fullSuit.completeSuit, true);
assert.equal(fullSuit.armorBonus, 10);
assert.equal(fullSuit.suitArmorBonus, 1);
assert.equal(fullSuit.acp, 4);
assert.equal(fullSuit.spellFailure, 35);
const fullSuitRows = buildArmorProfileSourceDetailRows(fullSuit);
assert.deepEqual(fullSuitRows.map((row) => row.name), [
  "PAcS Torso: Torso",
  "PAcS Arms: Arms",
  "PAcS Legs: Legs",
  "PAcS Full Suit"
]);
assert.deepEqual(fullSuitRows.map((row) => row.value), [6, 1, 2, 1]);
assert.equal(fullSuitRows.reduce((total, row) => total + row.value, 0), fullSuit.armorBonus + fullSuit.enhancementBonus);

const mixedSuit = calculatePiecemealArmor([
  item("mixed-torso", "Torso", { enabled: true, pieceCategory: "torso", coverageSlots: "torso", armorFamily: "plate", armorBonus: 6, spellFailure: 35 }),
  item("mixed-legs", "Legs", { enabled: true, pieceCategory: "legs", coverageSlots: "legs", armorFamily: "chain", armorBonus: 2, spellFailure: 20 }),
  item("mixed-arms", "Arms", { enabled: true, pieceCategory: "arms", coverageSlots: "arms", armorFamily: "plate", armorBonus: 1, spellFailure: 25 })
]);
assert.equal(mixedSuit.mixedSuit, true);
assert.equal(mixedSuit.spellFailure, 40);

const hastyPiece = calculatePiecemealArmor([
  item("hasty-plate-torso", "Hasty Plate Torso", { enabled: true, pieceCategory: "torso", coverageSlots: "torso", armorFamily: "plate", armorBonus: 6, acp: 4, spellFailure: 35, donState: "hasty" })
]);
assert.equal(hastyPiece.armorBonus, 5);
assert.equal(hastyPiece.acp, 5);

const zeroValuePieces = calculatePiecemealArmor([
  item("zero-arms", "Studded leather arms", { enabled: true, pieceCategory: "arms", coverageSlots: "arms", armorFamily: "studded-leather", armorBonus: 0 }),
  item("zero-legs", "Chain legs", { enabled: true, pieceCategory: "legs", coverageSlots: "legs", armorFamily: "chain", armorBonus: 0 })
]);
const zeroValueRows = buildArmorProfileSourceDetailRows(zeroValuePieces);
assert.deepEqual(zeroValueRows.map((row) => row.name), ["PAcS Arms: Studded leather arms", "PAcS Legs: Chain legs"]);
assert.deepEqual(zeroValueRows.map((row) => row.value), [0, 0]);

const enhancedPiece = calculatePiecemealArmor([
  item("enhanced-torso", "Enhanced torso", {
    enabled: true,
    pieceCategory: "torso",
    coverageSlots: "torso",
    armorFamily: "plate",
    armorBonus: 6,
    enhancementBonus: 2,
    magicMode: "separatePiece"
  })
]);
const enhancedRows = buildArmorProfileSourceDetailRows(enhancedPiece);
assert.equal(enhancedRows.at(-1).name, "PAcS Enhancement");
assert.equal(enhancedRows.at(-1).value, 2);
assert.equal(enhancedRows.reduce((total, row) => total + row.value, 0), enhancedPiece.armorBonus + enhancedPiece.enhancementBonus);

const separatelyEnhancedSuit = calculatePiecemealArmor([
  item("separate-torso", "Separately Enhanced Torso", {
    enabled: true,
    pieceCategory: "torso",
    coverageSlots: "torso",
    armorFamily: "plate",
    armorBonus: 6,
    enhancementBonus: 1,
    magicMode: "separatePiece"
  }),
  item("separate-legs", "Separately Enhanced Legs", {
    enabled: true,
    pieceCategory: "legs",
    coverageSlots: "legs",
    armorFamily: "plate",
    armorBonus: 1,
    enhancementBonus: 4,
    magicMode: "separatePiece"
  }),
  item("separate-arms", "Separately Enhanced Arms", {
    enabled: true,
    pieceCategory: "arms",
    coverageSlots: "arms",
    armorFamily: "plate",
    armorBonus: 1,
    enhancementBonus: 5,
    magicMode: "separatePiece"
  })
]);
assert.equal(separatelyEnhancedSuit.magic.appliedPieceId, "separate-torso");
assert.equal(separatelyEnhancedSuit.enhancementBonus, 1);

const enchantedSuit = calculatePiecemealArmor([
  item("magic-suit-torso", "Magic Suit Torso", { enabled: true, pieceCategory: "torso", coverageSlots: "torso", armorFamily: "plate", armorBonus: 6, enhancementBonus: 2, magicMode: "suit", suitId: "plate-suit" }),
  item("magic-suit-legs", "Magic Suit Legs", { enabled: true, pieceCategory: "legs", coverageSlots: "legs", armorFamily: "plate", armorBonus: 1, enhancementBonus: 2, magicMode: "suit", suitId: "plate-suit" }),
  item("magic-suit-arms", "Magic Suit Arms", { enabled: true, pieceCategory: "arms", coverageSlots: "arms", armorFamily: "plate", armorBonus: 1, enhancementBonus: 2, magicMode: "suit", suitId: "plate-suit" })
]);
assert.equal(enchantedSuit.magic.mode, "suit");
assert.equal(enchantedSuit.enhancementBonus, 2);
assert.equal(enchantedSuit.armorBonus, 9);

const mithralSuit = calculatePiecemealArmor([
  item("mithral-torso", "Torso", { enabled: true, pieceCategory: "torso", coverageSlots: "torso", armorFamily: "chain", material: "mithral", armorBonus: 4, maxDex: 4, acp: 4, spellFailure: 25, equipmentSubtype: "mediumArmor", weight: 20 }),
  item("mithral-legs", "Legs", { enabled: true, pieceCategory: "legs", coverageSlots: "legs", armorFamily: "chain", material: "mithral", armorBonus: 1, maxDex: 5, acp: 2, spellFailure: 15, equipmentSubtype: "mediumArmor", weight: 10 })
]);
assert.equal(mithralSuit.maxDex, 6);
assert.equal(mithralSuit.acp, 1);
assert.equal(mithralSuit.spellFailure, 15);
assert.equal(mithralSuit.equipmentSubtype, "lightArmor");

const duplicateCategory = calculatePiecemealArmor([
  item("weak-torso", "Weak Torso", { enabled: true, pieceCategory: "torso", coverageSlots: "torso", armorBonus: 2 }),
  item("strong-torso", "Strong Torso", { enabled: true, pieceCategory: "torso", coverageSlots: "torso", armorBonus: 5 })
]);
assert.deepEqual(duplicateCategory.componentIds, ["strong-torso"]);
assert.equal(duplicateCategory.ignoredPieces.length, 1);
assert.deepEqual(buildArmorProfileSourceDetailRows(duplicateCategory).map((row) => row.name), ["PAcS Torso: Strong Torso"]);

const neutralized = buildNeutralizeUpdate(torso);
assert.equal(neutralized["system.armor.value"], 0);
assert.equal(neutralized["system.equipped"], true);
assert.equal(neutralized["system.equipmentType"], "misc");
assert.equal(neutralized["system.equipmentSubtype"], "clothing");
assert.equal(neutralized["system.slot"], "body");
assert.ok(neutralized[`flags.${MODULE_ID}.nativeBackup`].native);

const backedUp = {
  ...torso,
  flags: {
    [MODULE_ID]: {
      piecemeal: torso.flags[MODULE_ID].piecemeal,
      nativeBackup: neutralized[`flags.${MODULE_ID}.nativeBackup`]
    }
  }
};
const restore = buildRestoreUpdate(backedUp);
assert.equal(restore["system.armor.value"], 0);
assert.equal(restore["system.slot"], "armor");
assert.equal(restore["system.equipmentType"], "armor");
assert.equal(restore["system.equipped"], true);

const oldSyncedHelmet = item("old-head", "Old synced helmet", {
  enabled: true,
  slot: "head",
  armorBonus: 1
}, {
  equipmentType: "armor",
  equipmentSubtype: "lightArmor",
  slot: "slotless"
});
oldSyncedHelmet.flags[MODULE_ID].nativeBackup = {
  native: {
    equipped: true,
    equipmentType: "armor",
    equipmentSubtype: "lightArmor",
    armor: { value: 1, enh: 0, dex: null, acp: 0 },
    spellFailure: 0,
    slot: "head"
  }
};
assert.equal(inferSyncedComponentVisualSlot(oldSyncedHelmet), "head");
assert.equal(buildNeutralizeUpdate(oldSyncedHelmet)["system.slot"], "head");
assert.equal(buildNeutralizeUpdate(item("eye", "Eye guard", {
  enabled: true,
  slot: "eyes; ears",
  armorBonus: 1
}, { equipmentType: "armor", slot: "armor" }))["system.slot"], "eyes");
assert.equal(buildNeutralizeUpdate(item("ear", "Ear guard", {
  enabled: true,
  slot: "ears",
  armorBonus: 1
}, { equipmentType: "armor", slot: "armor" }))["system.slot"], "head");
assert.equal(buildNeutralizeUpdate(item("torso-with-head", "Plate torso", {
  enabled: true,
  coverageSlots: "torso; chest; vitals; heart; head",
  pieceCategory: "torso",
  armorBonus: 6
}, { equipmentType: "armor", slot: "armor" }))["system.slot"], "body");
assert.equal(buildNeutralizeUpdate(item("legs", "Greaves", {
  enabled: true,
  slot: "legs",
  armorBonus: 1
}, { equipmentType: "armor", slot: "armor" }))["system.slot"], "feet");
assert.equal(buildNeutralizeUpdate(item("current-hands", "Current gloves", {
  enabled: true,
  slot: "arms",
  armorBonus: 1
}, { equipmentType: "armor", slot: "hands" }))["system.slot"], "hands");

const actor = {
  id: "actor-1",
  items: [torso, arms, ignored]
};
const plan = previewArmorSync(actor);
assert.equal(plan.componentUpdates.length, 2);
assert.equal(plan.summary.armorBonus, 4);

let emptyCreateCalled = false;
const emptySync = await syncArmorAggregate({
  id: "empty-actor",
  items: [],
  async createEmbeddedDocuments() {
    emptyCreateCalled = true;
  }
});
assert.equal(emptySync.skipped, true);
assert.equal(emptySync.reason, "noPieces");
assert.equal(emptyCreateCalled, false);

let aggregateEquipUpdate = null;
let aggregateEquipOptions = null;
let aggregateCreateOptions = null;
let componentUpdate = null;
let componentUpdateOptions = null;
const syncItem = {
  ...torso,
  update: async (update, options) => {
    componentUpdate = update;
    componentUpdateOptions = options;
  }
};
const syncItems = [syncItem];
syncItems.get = (id) => syncItems.find((entry) => entry.id === id);
await syncArmorAggregate({
  id: "sync-actor",
  items: syncItems,
  async createEmbeddedDocuments(_type, _data, options) {
    aggregateCreateOptions = options;
    return [{
      update: async (update, options) => {
        aggregateEquipUpdate = update;
        aggregateEquipOptions = options;
      }
    }];
  }
});
assert.deepEqual(aggregateCreateOptions, { _slotBypass: true });
assert.deepEqual(aggregateEquipUpdate, { "system.equipped": true });
assert.deepEqual(aggregateEquipOptions, { _slotBypass: true });
assert.equal(componentUpdate["system.armor.value"], 0);
assert.equal(componentUpdate["system.equipmentType"], "misc");
assert.deepEqual(componentUpdateOptions, { _slotBypass: true });
assert.ok(componentUpdate[`flags.${MODULE_ID}.nativeBackup`]);

console.log("test-armor: ok");
