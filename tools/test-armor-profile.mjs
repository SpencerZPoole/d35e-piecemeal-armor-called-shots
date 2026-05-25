import assert from "node:assert/strict";
import { ARMOR_PROFILE_STATUS, applyArmorProfile, clearArmorProfile, migrateLegacyArmorProfile, resolveArmorProfile, setArmorProfileBaseline, setArmorProfileSlot } from "../scripts/armor-profile.js";
import { FLAGS, MODULE_ID } from "../scripts/constants.js";

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
    }
  };
}

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
assert.equal(resolved.profile.baselineItemId, "studded");
assert.equal(resolved.summary.armorBonus, 2);
assert.equal(resolved.summary.completeSuit, true);
assert.equal(profileActor.items.some((item) => item.name === "PAcS Armor Profile"), true);
assert.equal(studded.system.equipmentType, "misc");
assert.equal(chainmail.system.equipmentType, "misc");

await clearArmorProfile(profileActor);
assert.equal(studded.system.equipmentType, "armor");
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
