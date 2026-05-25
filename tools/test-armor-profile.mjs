import assert from "node:assert/strict";
import { ARMOR_PROFILE_STATUS, applyArmorProfile, categoryForPacsEquipmentSlot, clearArmorProfile, migrateLegacyArmorProfile, registerPacsEquipmentSlots, resolveArmorProfile, setArmorProfileBaseline, setArmorProfileSlot } from "../scripts/armor-profile.js";
import { FLAGS, MODULE_ID, PACS_EQUIPMENT_SLOTS } from "../scripts/constants.js";

globalThis.game = {
  settings: {
    get(moduleId, key) {
      assert.equal(moduleId, MODULE_ID);
      if (key === "armorWorkflowMode") return "nativeProfile";
      if (key === "rulesMode") return "rawAdapted";
      return true;
    }
  }
};

globalThis.CONFIG = {
  D35E: {
    defaultSlotCapacities: {
      armor: 1,
      shield: 1,
      slotless: 999
    },
    equipmentSlots: {
      misc: { slotless: "D35E.EquipSlotSlotless" }
    }
  }
};

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
  for (const [path, value] of Object.entries(update)) setPath(document, path, value);
}

function equipment(id, name, system = {}, flags = {}) {
  const item = {
    id,
    name,
    type: "equipment",
    system: {
      equipped: false,
      carried: true,
      melded: false,
      equipmentType: "armor",
      equipmentSubtype: "lightArmor",
      armor: { value: 0, enh: 0, dex: null, acp: 0 },
      spellFailure: 0,
      slot: "slotless",
      weight: 0,
      ...system
    },
    flags,
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
  return item;
}

function actor(items = [], flags = {}) {
  items.get = (id) => items.find((item) => item.id === id) ?? null;
  return {
    id: "actor-1",
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
      const created = data.map((entry, index) => equipment(`created-${this.items.length + index}`, entry.name, entry.system, entry.flags));
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

assert.equal(registerPacsEquipmentSlots(), true);
assert.deepEqual(Object.keys(CONFIG.D35E.defaultSlotCapacities).slice(0, 5), ["armor", "pacsTorso", "pacsArms", "pacsLegs", "shield"]);
assert.equal(CONFIG.D35E.equipmentSlots.misc.pacsTorso, "D35E.EquipSlotPacsTorso");
assert.equal(categoryForPacsEquipmentSlot(PACS_EQUIPMENT_SLOTS.arms), "arms");

const studded = equipment("studded", "Studded Leather", {
  equipped: true,
  armor: { value: 3, enh: 0, dex: 5, acp: 0 },
  spellFailure: 15,
  weight: 20
});
let profileActor = actor([studded]);
let resolved = resolveArmorProfile(profileActor);
assert.equal(resolved.status, ARMOR_PROFILE_STATUS.nativeArmor);
assert.equal(resolved.summary.armorBonus, 3);
assert.equal(resolved.summary.completeSuit, true);
await applyArmorProfile(profileActor);
assert.equal(profileActor.items.some((item) => item.name === "PAcS Armor Profile"), false);

const unequippedStudded = equipment("studded-2", "Studded Leather", {
  equipped: false,
  armor: { value: 3, enh: 0, dex: 5, acp: 0 },
  spellFailure: 15,
  weight: 20
});
const baselineOnlyActor = actor([unequippedStudded]);
await setArmorProfileBaseline(baselineOnlyActor, "studded-2");
resolved = resolveArmorProfile(baselineOnlyActor);
assert.equal(resolved.status, ARMOR_PROFILE_STATUS.nativeArmor);
assert.equal(unequippedStudded.system.equipped, true);
assert.equal(unequippedStudded.system.equipmentType, "armor");
assert.equal(baselineOnlyActor.items.some((item) => item.name === "PAcS Armor Profile"), false);

const armsOnlyStudded = equipment("studded-arms", "Studded Leather", {
  equipped: false,
  armor: { value: 3, enh: 0, dex: 5, acp: 0 },
  spellFailure: 15,
  weight: 20
});
const armsOnlyActor = actor([armsOnlyStudded]);
await setArmorProfileSlot(armsOnlyActor, "arms", "studded-arms");
resolved = resolveArmorProfile(armsOnlyActor);
assert.equal(resolved.status, ARMOR_PROFILE_STATUS.compositeProfile);
assert.equal(resolved.baselineItem, null);
assert.equal(resolved.summary.armorBonus, 0);
assert.equal(armsOnlyStudded.system.equipmentType, "misc");
assert.equal(armsOnlyStudded.system.slot, PACS_EQUIPMENT_SLOTS.arms);
let carrier = armsOnlyActor.items.find((item) => item.name === "PAcS Armor Profile");
assert.equal(carrier.system.equipmentType, "misc");
assert.equal(carrier.system.slot, "slotless");
assert.equal(carrier.system.armor.value, 0);
assert.equal(armsOnlyActor.refreshCount > 0, true);

const equippedArmsOnlyStudded = equipment("equipped-studded-arms", "Studded Leather", {
  equipped: true,
  armor: { value: 3, enh: 0, dex: 5, acp: 0 },
  spellFailure: 15,
  weight: 20
});
const equippedArmsOnlyActor = actor([equippedArmsOnlyStudded]);
await setArmorProfileSlot(equippedArmsOnlyActor, "arms", "equipped-studded-arms");
resolved = resolveArmorProfile(equippedArmsOnlyActor);
assert.equal(resolved.status, ARMOR_PROFILE_STATUS.compositeProfile);
assert.equal(resolved.baselineItem, null);
assert.equal(resolved.summary.armorBonus, 0);
assert.equal(equippedArmsOnlyStudded.system.equipmentType, "misc");
assert.equal(equippedArmsOnlyStudded.system.slot, PACS_EQUIPMENT_SLOTS.arms);
assert.equal(equippedArmsOnlyActor.items.find((item) => item.name === "PAcS Armor Profile").system.armor.value, 0);
assert.equal(equippedArmsOnlyActor.refreshCount > 0, true);

const zeroStudded = equipment("zero-studded", "Studded Leather", { equipped: false });
const zeroChain = equipment("zero-chain", "Chainmail", { equipped: false, equipmentSubtype: "mediumArmor" });
const zeroActor = actor([zeroStudded, zeroChain]);
await setArmorProfileSlot(zeroActor, "arms", "zero-studded");
await setArmorProfileSlot(zeroActor, "legs", "zero-chain");
resolved = resolveArmorProfile(zeroActor);
assert.equal(resolved.summary.armorBonus, 0);
assert.equal(zeroActor.items.find((item) => item.name === "PAcS Armor Profile").system.armor.value, 0);
await setArmorProfileSlot(zeroActor, "arms", "zero-chain");
resolved = resolveArmorProfile(zeroActor);
assert.equal(resolved.profile.slots.arms, "zero-chain");
assert.equal(resolved.profile.slots.legs, null);
assert.equal(resolved.pieces.length, 1);
assert.equal(resolved.summary.armorBonus, 1);

const switchStudded = equipment("switch-studded", "Studded Leather", { equipped: false });
const switchChain = equipment("switch-chain", "Chainmail", { equipped: false, equipmentSubtype: "mediumArmor" });
const switchActor = actor([switchStudded, switchChain]);
await setArmorProfileSlot(switchActor, "arms", "switch-studded");
assert.equal(resolveArmorProfile(switchActor).summary.armorBonus, 0);
await setArmorProfileSlot(switchActor, "arms", "switch-chain");
resolved = resolveArmorProfile(switchActor);
assert.equal(resolved.summary.armorBonus, 1);
assert.equal(switchStudded.system.equipmentType, "armor");
assert.equal(switchChain.system.equipmentType, "misc");
assert.equal(switchChain.system.slot, PACS_EQUIPMENT_SLOTS.arms);
assert.equal(switchActor.items.find((item) => item.name === "PAcS Armor Profile").system.armor.value, 1);
await setArmorProfileSlot(switchActor, "arms", null);
resolved = resolveArmorProfile(switchActor);
assert.equal(resolved.status, ARMOR_PROFILE_STATUS.empty);
assert.equal(switchChain.system.equipmentType, "armor");
assert.equal(switchActor.items.some((item) => item.name === "PAcS Armor Profile"), false);

const chainmail = equipment("chainmail", "Chainmail", {
  equipped: false,
  equipmentSubtype: "mediumArmor",
  armor: { value: 5, enh: 0, dex: 2, acp: 5 },
  spellFailure: 30,
  weight: 40
});
profileActor = actor([studded, chainmail]);
await setArmorProfileSlot(profileActor, "legs", "chainmail");
resolved = resolveArmorProfile(profileActor);
assert.equal(resolved.status, ARMOR_PROFILE_STATUS.compositeProfile);
assert.equal(resolved.profile.baselineItemId, null);
assert.equal(resolved.baselineItem.id, "studded");
assert.equal(resolved.summary.armorBonus, 2);
assert.equal(resolved.summary.completeSuit, true);
assert.equal(profileActor.items.some((item) => item.name === "PAcS Armor Profile"), true);
carrier = profileActor.items.find((item) => item.name === "PAcS Armor Profile");
assert.equal(carrier.system.equipmentType, "misc");
assert.equal(carrier.system.slot, "slotless");
assert.equal(carrier.system.armor.value, 2);
assert.equal(studded.system.equipmentType, "armor");
assert.equal(studded.system.armor.value, 0);
assert.equal(chainmail.system.equipmentType, "misc");
assert.equal(chainmail.system.slot, PACS_EQUIPMENT_SLOTS.legs);

await clearArmorProfile(profileActor);
assert.equal(studded.system.equipmentType, "armor");
assert.equal(studded.system.armor.value, 3);
assert.equal(chainmail.system.equipmentType, "armor");
assert.equal(profileActor.items.some((item) => item.name === "PAcS Armor Profile"), false);

const breastplate = equipment("breastplate", "Breastplate", { equipped: false });
const singlePieceActor = actor([breastplate], {
  [MODULE_ID]: {
    [FLAGS.armorProfile]: {
      slots: { torso: "breastplate" }
    }
  }
});
resolved = resolveArmorProfile(singlePieceActor);
assert.equal(resolved.status, ARMOR_PROFILE_STATUS.compositeProfile);
assert.equal(resolved.summary.armorBonus, 6);
assert.equal(resolved.summary.completeSuit, false);

const custom = equipment("custom", "Mirror-Bright Weird Armor", { equipped: false });
const unresolvedActor = actor([custom], {
  [MODULE_ID]: {
    [FLAGS.armorProfile]: {
      slots: { arms: "custom" }
    }
  }
});
resolved = resolveArmorProfile(unresolvedActor);
assert.equal(resolved.status, ARMOR_PROFILE_STATUS.needsPieceValues);
const skipped = await applyArmorProfile(unresolvedActor);
assert.equal(skipped.reason, "needsPieceValues");
assert.equal(unresolvedActor.items.some((item) => item.name === "PAcS Armor Profile"), false);

const staleCarrierActor = actor([breastplate, custom], {
  [MODULE_ID]: {
    [FLAGS.armorProfile]: {
      slots: { torso: "breastplate" }
    }
  }
});
await applyArmorProfile(staleCarrierActor);
assert.equal(staleCarrierActor.items.some((item) => item.name === "PAcS Armor Profile"), true);
await setArmorProfileSlot(staleCarrierActor, "arms", "custom");
assert.equal(staleCarrierActor.items.some((item) => item.name === "PAcS Armor Profile"), false);

const legacyPiece = equipment("legacy-legs", "Legacy legs", {}, {
  [MODULE_ID]: {
    [FLAGS.piecemeal]: {
      enabled: true,
      pieceCategory: "legs",
      armorBonus: 1
    },
    [FLAGS.nativeBackup]: {
      native: {
        equipped: true,
        equipmentType: "armor",
        equipmentSubtype: "lightArmor",
        armor: { value: 1, enh: 0, dex: null, acp: 0 },
        spellFailure: 0,
        slot: "slotless",
        masterwork: false
      }
    }
  }
});
const legacyAggregate = equipment("aggregate", "Piecemeal Armor Aggregate", { equipped: true }, {
  [MODULE_ID]: {
    [FLAGS.aggregate]: { isAggregate: true }
  }
});
const legacyActor = actor([legacyPiece, legacyAggregate]);
const migration = await migrateLegacyArmorProfile(legacyActor);
assert.equal(migration.migrated, true);
assert.equal(legacyActor.getFlag(MODULE_ID, FLAGS.armorProfile).slots.legs, "legacy-legs");
assert.equal(legacyActor.items.some((item) => item.id === "aggregate"), false);
assert.equal(legacyPiece.system.equipmentType, "armor");

console.log("test-armor-profile: ok");
