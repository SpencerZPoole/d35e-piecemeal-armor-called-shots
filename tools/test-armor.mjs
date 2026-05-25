import assert from "node:assert/strict";
import {
  buildAggregateItemData,
  buildNeutralizeUpdate,
  buildRestoreUpdate,
  calculatePiecemealArmor,
  inferSyncedComponentVisualSlot,
  previewArmorSync,
  RAW_ARMOR_PIECE_CATALOG,
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
assert.equal(plateTorsoCatalog.armorBonus, 6);
assert.equal(plateTorsoCatalog.coverageSlots.includes("heart"), true);

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

const mixedSuit = calculatePiecemealArmor([
  item("mixed-torso", "Torso", { enabled: true, pieceCategory: "torso", coverageSlots: "torso", armorFamily: "plate", armorBonus: 6, spellFailure: 35 }),
  item("mixed-legs", "Legs", { enabled: true, pieceCategory: "legs", coverageSlots: "legs", armorFamily: "chain", armorBonus: 2, spellFailure: 20 }),
  item("mixed-arms", "Arms", { enabled: true, pieceCategory: "arms", coverageSlots: "arms", armorFamily: "plate", armorBonus: 1, spellFailure: 25 })
]);
assert.equal(mixedSuit.mixedSuit, true);
assert.equal(mixedSuit.spellFailure, 40);

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
