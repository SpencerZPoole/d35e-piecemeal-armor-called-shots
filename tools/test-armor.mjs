import assert from "node:assert/strict";
import {
  buildAggregateItemData,
  buildNeutralizeUpdate,
  buildRestoreUpdate,
  calculatePiecemealArmor,
  previewArmorSync,
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
  equipmentSubtype: "mediumArmor"
});
const arms = item("b", "Arm guards", {
  enabled: true,
  slot: "arms",
  armorBonus: 1,
  maxDex: 6,
  acp: 1,
  spellFailure: 5,
  equipmentSubtype: "lightArmor"
});
const ignored = item("c", "Backpack", { enabled: false });

const summary = calculatePiecemealArmor([torso, arms, ignored]);
assert.equal(summary.armorBonus, 4);
assert.equal(summary.enhancementBonus, 1);
assert.equal(summary.maxDex, 4);
assert.equal(summary.acp, 3);
assert.equal(summary.spellFailure, 20);
assert.equal(summary.equipmentSubtype, "mediumArmor");
assert.deepEqual(summary.componentIds, ["a", "b"]);

const aggregate = buildAggregateItemData(summary);
assert.equal(aggregate.name, "Piecemeal Armor Aggregate");
assert.equal(aggregate.system.armor.value, 4);
assert.equal(aggregate.system.armor.enh, 1);
assert.equal(aggregate.system.armor.dex, 4);
assert.equal(aggregate.system.armor.acp, -3);

const neutralized = buildNeutralizeUpdate(torso);
assert.equal(neutralized["system.armor.value"], 0);
assert.equal(neutralized["system.slot"], "slotless");
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
const syncItem = {
  ...torso,
  update: async (update) => {
    componentUpdate = update;
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
assert.ok(componentUpdate[`flags.${MODULE_ID}.nativeBackup`]);

console.log("test-armor: ok");
