import assert from "node:assert/strict";
import {
  ARMOR_PROFILE_STATUS,
  applyArmorProfile,
  categoryForPacsEquipmentSlot,
  clearArmorProfile,
  decorateArmorProfileSourceDetails,
  migrateLegacyArmorProfile,
  reconcileArmorProfile,
  registerPacsEquipmentSlots,
  resumeArmorProfileAutomation,
  resolveArmorProfile,
  setArmorProfileBaseline,
  setArmorProfileSlot,
  suspendArmorProfileAutomation
} from "../scripts/armor-profile.js";
import { FLAGS, MODULE_ID, PACS_EQUIPMENT_SLOTS } from "../scripts/constants.js";

const NORMAL_AC_PATH = "system.attributes.ac.normal.total";
const TOUCH_AC_PATH = "system.attributes.ac.touch.total";
const FLAT_FOOTED_AC_PATH = "system.attributes.ac.flatFooted.total";

let armorAutomationEnabled = true;
globalThis.game = {
  settings: {
    get(moduleId, key) {
      assert.equal(moduleId, MODULE_ID);
      if (key === "enableArmorAutomation") return armorAutomationEnabled;
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
    async deleteEmbeddedDocuments(_documentName, ids, options = {}) {
      this.lastDeleteOptions = options;
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

function armorProfileSourceValue(actor, path) {
  return actor.sourceDetails[path]
    .filter((row) => row.moduleId === MODULE_ID && row.pacsArmorProfileBreakdown === true)
    .reduce((total, row) => total + row.value, 0);
}

assert.equal(registerPacsEquipmentSlots(), true);
assert.deepEqual(Object.keys(CONFIG.D35E.defaultSlotCapacities).slice(0, 5), ["armor", "pacsTorso", "pacsArms", "pacsLegs", "shield"]);
assert.equal(CONFIG.D35E.equipmentSlots.misc.pacsTorso, "PAcS: Torso");
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
assert.equal(studded.system.equipmentType, "armor");
assert.equal(studded.system.equipped, true);
assert.equal(studded.system.armor.value, 3);
assert.equal(studded.system.armor.dex, 5);
assert.equal(studded.system.weight, 20);

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
zeroActor.sourceDetails = {
  [NORMAL_AC_PATH]: [{ name: "Base", value: 10 }],
  [TOUCH_AC_PATH]: [{ name: "Base", value: 10 }, { name: "Dex", value: 3 }],
  [FLAT_FOOTED_AC_PATH]: [{ name: "Base", value: 10 }]
};
const zeroDecoration = decorateArmorProfileSourceDetails(zeroActor, resolved);
assert.equal(zeroDecoration.decorated, true);
assert.deepEqual(zeroActor.sourceDetails[NORMAL_AC_PATH].filter((row) => row.moduleId === MODULE_ID).map((row) => row.value), [0, 0]);
assert.deepEqual(zeroActor.sourceDetails[TOUCH_AC_PATH], [{ name: "Base", value: 10 }, { name: "Dex", value: 3 }]);
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
assert.equal(switchActor.items.some((item) => item.id === "switch-chain"), true);
carrier = switchActor.items.find((item) => item.name === "PAcS Armor Profile");
assert.equal(Boolean(carrier), true);
assert.equal(carrier.system.equipped, false);
assert.equal(carrier.system.armor.value, 0);
assert.equal(carrier.getFlag(MODULE_ID, FLAGS.internalArmor).suspended, true);

const quickClearBaseline = equipment("quick-clear-baseline", "Chainmail", {
  equipped: true,
  equipmentSubtype: "mediumArmor",
  armor: { value: 5, enh: 0, dex: 2, acp: 5 },
  spellFailure: 30,
  slot: "armor",
  weight: 40
});
const quickClearTorso = equipment("quick-clear-torso", "Chainmail", {
  equipped: false,
  equipmentSubtype: "mediumArmor",
  armor: { value: 5, enh: 0, dex: 2, acp: 5 },
  spellFailure: 30,
  weight: 40
});
const quickClearLegs = equipment("quick-clear-legs", "Studded Leather", {
  equipped: false,
  armor: { value: 3, enh: 0, dex: 5, acp: 0 },
  spellFailure: 15,
  weight: 20
});
const quickClearActor = actor([quickClearBaseline, quickClearTorso, quickClearLegs]);
await setArmorProfileSlot(quickClearActor, "legs", "quick-clear-legs");
await setArmorProfileSlot(quickClearActor, "torso", "quick-clear-torso");
assert.equal(resolveArmorProfile(quickClearActor).status, ARMOR_PROFILE_STATUS.compositeProfile);
assert.equal(quickClearBaseline.system.armor.value, 0);
await setArmorProfileSlot(quickClearActor, "legs", null);
await setArmorProfileSlot(quickClearActor, "torso", null);
resolved = resolveArmorProfile(quickClearActor);
assert.equal(resolved.status, ARMOR_PROFILE_STATUS.nativeArmor);
assert.equal(quickClearBaseline.system.equipmentType, "armor");
assert.equal(quickClearBaseline.system.equipped, true);
assert.equal(quickClearBaseline.system.slot, "armor");
assert.equal(quickClearBaseline.system.armor.value, 5);
assert.equal(quickClearBaseline.system.armor.dex, 2);
carrier = quickClearActor.items.find((item) => item.name === "PAcS Armor Profile");
assert.equal(Boolean(carrier), true);
assert.equal(carrier.system.equipped, false);
assert.equal(carrier.system.armor.value, 0);

const dragBackChain = equipment("drag-back-chain", "Chainmail", {
  equipped: false,
  equipmentSubtype: "mediumArmor",
  armor: { value: 5, enh: 0, dex: 2, acp: 5 },
  spellFailure: 30,
  weight: 40
});
const dragBackActor = actor([dragBackChain]);
await setArmorProfileSlot(dragBackActor, "arms", "drag-back-chain");
carrier = dragBackActor.items.find((item) => item.name === "PAcS Armor Profile");
assert.equal(carrier.system.armor.dex, 2);
assert.equal(dragBackChain.system.armor.dex, null);
await setArmorProfileBaseline(dragBackActor, "drag-back-chain");
resolved = resolveArmorProfile(dragBackActor);
assert.equal(resolved.status, ARMOR_PROFILE_STATUS.nativeArmor);
assert.equal(resolved.profile.baselineItemId, "drag-back-chain");
assert.equal(resolved.profile.slots.arms, null);
carrier = dragBackActor.items.find((item) => item.name === "PAcS Armor Profile");
assert.equal(Boolean(carrier), true);
assert.equal(carrier.system.equipped, false);
assert.equal(carrier.system.armor.value, 0);
assert.equal(carrier.getFlag(MODULE_ID, FLAGS.internalArmor).suspended, true);
assert.equal(dragBackChain.system.equipmentType, "armor");
assert.equal(dragBackChain.system.equipped, true);
assert.equal(dragBackChain.system.armor.value, 5);
assert.equal(dragBackChain.system.armor.dex, 2);

const dragBackCompositeChain = equipment("drag-back-composite-chain", "Chainmail", {
  equipped: false,
  equipmentSubtype: "mediumArmor",
  armor: { value: 5, enh: 0, dex: 2, acp: 5 },
  spellFailure: 30,
  weight: 40
});
const dragBackCompositeLegs = equipment("drag-back-composite-legs", "Studded Leather", {
  equipped: false,
  armor: { value: 3, enh: 0, dex: 5, acp: 0 },
  spellFailure: 15,
  weight: 20
});
const dragBackCompositeActor = actor([dragBackCompositeChain, dragBackCompositeLegs]);
await setArmorProfileSlot(dragBackCompositeActor, "arms", "drag-back-composite-chain");
await setArmorProfileSlot(dragBackCompositeActor, "legs", "drag-back-composite-legs");
await setArmorProfileBaseline(dragBackCompositeActor, "drag-back-composite-chain");
resolved = resolveArmorProfile(dragBackCompositeActor);
assert.equal(resolved.status, ARMOR_PROFILE_STATUS.compositeProfile);
assert.equal(resolved.profile.baselineItemId, "drag-back-composite-chain");
assert.equal(resolved.profile.slots.arms, null);
assert.equal(resolved.profile.slots.legs, "drag-back-composite-legs");
assert.equal(resolved.sourceRoles.get("drag-back-composite-chain").role, "baseline");
assert.equal(dragBackCompositeChain.system.equipmentType, "armor");
assert.equal(dragBackCompositeChain.system.armor.value, 0);
assert.equal(dragBackCompositeChain.system.armor.dex, null);
assert.equal(dragBackCompositeLegs.system.equipmentType, "misc");
assert.equal(dragBackCompositeLegs.system.armor.dex, null);
carrier = dragBackCompositeActor.items.find((item) => item.name === "PAcS Armor Profile");
assert.equal(carrier.system.armor.value, 6);
assert.equal(carrier.system.armor.dex, 2);

const suspendBaseline = equipment("suspend-studded", "Studded Leather", {
  equipped: true,
  armor: { value: 3, enh: 0, dex: 5, acp: 0 },
  spellFailure: 15,
  weight: 20
});
const suspendOverride = equipment("suspend-chain", "Chainmail", {
  equipped: true,
  equipmentSubtype: "mediumArmor",
  armor: { value: 5, enh: 0, dex: 2, acp: 5 },
  spellFailure: 30,
  weight: 40
});
const suspendActor = actor([suspendBaseline, suspendOverride]);
await setArmorProfileSlot(suspendActor, "legs", "suspend-chain");
assert.equal(suspendActor.items.some((item) => item.name === "PAcS Armor Profile"), true);
const suspended = await suspendArmorProfileAutomation(suspendActor);
assert.equal(suspended.suspended, true);
assert.equal(suspendActor.getFlag(MODULE_ID, FLAGS.armorProfile).slots.legs, "suspend-chain");
assert.equal(suspendActor.getFlag(MODULE_ID, FLAGS.armorProfile).suspended, true);
let suspendCarrier = suspendActor.items.find((item) => item.name === "PAcS Armor Profile");
assert.equal(Boolean(suspendCarrier), true);
assert.equal(suspendCarrier.system.equipped, false);
assert.equal(suspendCarrier.system.armor.value, 0);
assert.equal(suspendCarrier.getFlag(MODULE_ID, FLAGS.internalArmor).suspended, true);
assert.equal(suspendOverride.system.equipmentType, "armor");
assert.equal(suspendOverride.system.equipped, false);
assert.equal(suspendOverride.system.armor.value, 5);
armorAutomationEnabled = false;
const applyWhileDisabled = await applyArmorProfile(suspendActor, { migrateLegacy: false });
assert.equal(applyWhileDisabled.suspended, true);
suspendCarrier = suspendActor.items.find((item) => item.name === "PAcS Armor Profile");
assert.equal(suspendCarrier.system.equipped, false);
assert.equal(suspendCarrier.system.armor.value, 0);
assert.equal(suspendCarrier.getFlag(MODULE_ID, FLAGS.internalArmor).suspended, true);
armorAutomationEnabled = true;
const resumed = await resumeArmorProfileAutomation(suspendActor);
assert.equal(resumed.status, ARMOR_PROFILE_STATUS.compositeProfile);
assert.equal(suspendActor.getFlag(MODULE_ID, FLAGS.armorProfile).suspended, false);
suspendCarrier = suspendActor.items.find((item) => item.name === "PAcS Armor Profile");
assert.equal(Boolean(suspendCarrier), true);
assert.equal(suspendCarrier.getFlag(MODULE_ID, FLAGS.internalArmor).suspended, false);
assert.equal(suspendOverride.system.equipmentType, "misc");
assert.equal(suspendOverride.system.slot, PACS_EQUIPMENT_SLOTS.legs);

const staleNativeBaseline = equipment("stale-native-chain", "Chainmail", {
  equipped: true,
  equipmentSubtype: "mediumArmor",
  armor: { value: 5, enh: 0, dex: 2, acp: 5 },
  spellFailure: 30,
  slot: "armor",
  weight: 40
});
const replacementBaseline = equipment("replacement-studded", "Studded Leather", {
  equipped: true,
  armor: { value: 3, enh: 0, dex: 5, acp: 0 },
  spellFailure: 15,
  slot: "armor",
  weight: 20
});
const replacementOverride = equipment("replacement-chain-arms", "Chainmail", {
  equipped: false,
  equipmentSubtype: "mediumArmor",
  armor: { value: 5, enh: 0, dex: 2, acp: 5 },
  spellFailure: 30,
  weight: 40
});
const staleNativeActor = actor([staleNativeBaseline, replacementBaseline, replacementOverride]);
await setArmorProfileBaseline(staleNativeActor, "stale-native-chain");
await setArmorProfileBaseline(staleNativeActor, "replacement-studded");
await setArmorProfileSlot(staleNativeActor, "arms", "replacement-chain-arms");
resolved = resolveArmorProfile(staleNativeActor);
assert.equal(resolved.status, ARMOR_PROFILE_STATUS.compositeProfile);
assert.equal(resolved.summary.armorBonus, 4);
assert.equal(staleNativeBaseline.system.equipped, false);
assert.equal(staleNativeBaseline.system.slot, "slotless");
assert.equal(replacementBaseline.system.equipped, true);
assert.equal(replacementBaseline.system.armor.value, 0);
carrier = staleNativeActor.items.find((item) => item.name === "PAcS Armor Profile");
assert.equal(carrier.system.armor.value, 4);

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
assert.equal(studded.system.armor.dex, null);
assert.equal(chainmail.system.equipmentType, "misc");
assert.equal(chainmail.system.slot, PACS_EQUIPMENT_SLOTS.legs);
assert.equal(chainmail.system.armor.dex, null);
assert.equal(carrier.system.armor.dex, 2);
assert.equal(carrier.system.weight, 0);
assert.equal(carrier.getFlag(MODULE_ID, FLAGS.aggregate).summary.weight, 27);

const mixedOverrideStudded = equipment("mixed-studded", "Studded Leather", {
  equipped: true,
  armor: { value: 3, enh: 0, dex: 5, acp: 0 },
  spellFailure: 15,
  weight: 20
});
const mixedOverrideChainTorso = equipment("mixed-chain-torso", "Chainmail", {
  equipped: false,
  equipmentSubtype: "mediumArmor",
  armor: { value: 5, enh: 0, dex: 2, acp: 5 },
  spellFailure: 30,
  weight: 40
});
const mixedOverrideChainArms = equipment("mixed-chain-arms", "Chainmail", {
  equipped: false,
  equipmentSubtype: "mediumArmor",
  armor: { value: 5, enh: 0, dex: 2, acp: 5 },
  spellFailure: 30,
  weight: 40
});
const mixedOverrideActor = actor([mixedOverrideStudded, mixedOverrideChainTorso, mixedOverrideChainArms]);
await setArmorProfileSlot(mixedOverrideActor, "torso", "mixed-chain-torso");
await setArmorProfileSlot(mixedOverrideActor, "arms", "mixed-chain-arms");
resolved = resolveArmorProfile(mixedOverrideActor);
assert.equal(resolved.status, ARMOR_PROFILE_STATUS.compositeProfile);
assert.equal(resolved.profile.baselineItemId, "mixed-studded");
assert.equal(resolved.summary.completeSuit, true);
assert.equal(resolved.summary.mixedSuit, true);
assert.equal(resolved.summary.armorBonus, 6);
assert.equal(resolved.summary.maxDex, 2);
assert.equal(resolved.summary.acp, 3);
assert.equal(resolved.summary.spellFailure, 35);
assert.equal(resolved.summary.weight, 33);
carrier = mixedOverrideActor.items.find((item) => item.name === "PAcS Armor Profile");
assert.equal(carrier.system.armor.value, 6);
assert.equal(carrier.system.armor.dex, 2);
assert.equal(carrier.system.armor.acp, -3);
assert.equal(carrier.system.spellFailure, 35);
assert.equal(carrier.system.weight, 0);
assert.equal(mixedOverrideStudded.system.armor.value, 0);
assert.equal(mixedOverrideStudded.system.armor.dex, null);
assert.equal(mixedOverrideChainTorso.system.slot, PACS_EQUIPMENT_SLOTS.torso);
assert.equal(mixedOverrideChainArms.system.slot, PACS_EQUIPMENT_SLOTS.arms);

resolved = resolveArmorProfile(profileActor);
carrier = profileActor.items.find((item) => item.name === "PAcS Armor Profile");
profileActor.sourceDetails = {
  [NORMAL_AC_PATH]: [
    { name: "Base", value: 10 },
    { name: "Armor [Equipment -> PAcS Armor Profile]", value: carrier.system.armor.value, isItemBonus: true }
  ],
  [TOUCH_AC_PATH]: [
    { name: "Base", value: 10 },
    { name: "Dex", value: 3 }
  ],
  [FLAT_FOOTED_AC_PATH]: [
    { name: "Base", value: 10 },
    { name: "Armor [Equipment -> PAcS Armor Profile]", value: carrier.system.armor.value, isItemBonus: true }
  ]
};
const touchDetailsBefore = JSON.stringify(profileActor.sourceDetails[TOUCH_AC_PATH]);
let decoration = decorateArmorProfileSourceDetails(profileActor, resolved);
assert.equal(decoration.decorated, true);
assert.equal(decoration.removedCarrierRows, 2);
assert.equal(profileActor.sourceDetails[NORMAL_AC_PATH].some((row) => String(row.name).includes("PAcS Armor Profile")), false);
assert.deepEqual(profileActor.sourceDetails[NORMAL_AC_PATH].filter((row) => row.moduleId === MODULE_ID).map((row) => row.name), [
  "PAcS Torso: Studded Leather",
  "PAcS Arms: Studded Leather",
  "PAcS Legs: Chainmail",
  "PAcS Full Suit"
]);
assert.deepEqual(profileActor.sourceDetails[NORMAL_AC_PATH].filter((row) => row.moduleId === MODULE_ID).map((row) => row.value), [1, 0, 0, 1]);
assert.equal(armorProfileSourceValue(profileActor, NORMAL_AC_PATH), carrier.system.armor.value);
assert.equal(armorProfileSourceValue(profileActor, FLAT_FOOTED_AC_PATH), carrier.system.armor.value);
assert.equal(JSON.stringify(profileActor.sourceDetails[TOUCH_AC_PATH]), touchDetailsBefore);
decoration = decorateArmorProfileSourceDetails(profileActor, resolved);
assert.equal(profileActor.sourceDetails[NORMAL_AC_PATH].filter((row) => row.moduleId === MODULE_ID).length, 4);

const clearBaselineStudded = equipment("clear-baseline-studded", "Studded Leather", {
  equipped: true,
  armor: { value: 3, enh: 0, dex: 5, acp: 0 },
  spellFailure: 15,
  weight: 20
});
const clearBaselineChain = equipment("clear-baseline-chain", "Chainmail", {
  equipped: false,
  equipmentSubtype: "mediumArmor",
  armor: { value: 5, enh: 0, dex: 2, acp: 5 },
  spellFailure: 30,
  weight: 40
});
const clearBaselineActor = actor([clearBaselineStudded, clearBaselineChain]);
await setArmorProfileSlot(clearBaselineActor, "arms", "clear-baseline-chain");
assert.equal(clearBaselineActor.getFlag(MODULE_ID, FLAGS.armorProfile).baselineItemId, "clear-baseline-studded");
await setArmorProfileBaseline(clearBaselineActor, null);
resolved = resolveArmorProfile(clearBaselineActor);
assert.equal(resolved.status, ARMOR_PROFILE_STATUS.compositeProfile);
assert.equal(resolved.profile.baselineItemId, null);
assert.equal(resolved.baselineItem, null);
assert.equal(resolved.summary.armorBonus, 1);
assert.equal(clearBaselineStudded.system.equipmentType, "armor");
assert.equal(clearBaselineStudded.system.equipped, false);
assert.equal(clearBaselineStudded.system.armor.value, 3);
assert.equal(clearBaselineChain.system.equipmentType, "misc");
assert.equal(clearBaselineChain.system.slot, PACS_EQUIPMENT_SLOTS.arms);

const explicitNoBaselineActor = actor([
  equipment("ignored-equipped-armor", "Studded Leather", {
    equipped: true,
    armor: { value: 3, enh: 0, dex: 5, acp: 0 },
    spellFailure: 15,
    weight: 20
  }),
  equipment("explicit-chain-arms", "Chainmail", {
    equipped: false,
    equipmentSubtype: "mediumArmor",
    armor: { value: 5, enh: 0, dex: 2, acp: 5 },
    spellFailure: 30,
    weight: 40
  })
], {
  [MODULE_ID]: {
    [FLAGS.armorProfile]: {
      baselineItemId: null,
      slots: { torso: null, arms: "explicit-chain-arms", legs: null }
    }
  }
});
resolved = resolveArmorProfile(explicitNoBaselineActor);
assert.equal(resolved.status, ARMOR_PROFILE_STATUS.compositeProfile);
assert.equal(resolved.baselineItem, null);
assert.equal(resolved.pieces.length, 1);
assert.equal(resolved.summary.armorBonus, 1);

const nativeSourceActor = actor([equipment("native", "Studded Leather", { equipped: true, armor: { value: 3, enh: 0, dex: 5, acp: 0 } })]);
nativeSourceActor.sourceDetails = {
  [NORMAL_AC_PATH]: [{ name: "Base", value: 10 }, { name: "Armor [Equipment -> Studded Leather]", value: 3 }],
  [TOUCH_AC_PATH]: [{ name: "Base", value: 10 }],
  [FLAT_FOOTED_AC_PATH]: [{ name: "Base", value: 10 }, { name: "Armor [Equipment -> Studded Leather]", value: 3 }]
};
decoration = decorateArmorProfileSourceDetails(nativeSourceActor);
assert.equal(decoration.decorated, false);
assert.deepEqual(nativeSourceActor.sourceDetails[NORMAL_AC_PATH], [{ name: "Base", value: 10 }, { name: "Armor [Equipment -> Studded Leather]", value: 3 }]);

const multipleNativeActor = actor([
  equipment("native-studded", "Studded Leather", { equipped: true, armor: { value: 3, enh: 0, dex: 5, acp: 0 } }),
  equipment("native-chain", "Chainmail", { equipped: true, equipmentSubtype: "mediumArmor", armor: { value: 5, enh: 0, dex: 2, acp: 5 } })
]);
resolved = resolveArmorProfile(multipleNativeActor);
assert.equal(resolved.status, ARMOR_PROFILE_STATUS.empty);
assert.equal(resolved.baselineItem, null);
assert.deepEqual(resolved.warnings, [{
  category: "baseline",
  reason: "multipleNativeArmor",
  itemNames: ["Studded Leather", "Chainmail"]
}]);
await applyArmorProfile(multipleNativeActor);
assert.equal(multipleNativeActor.items.some((item) => item.name === "PAcS Armor Profile"), false);
assert.equal(multipleNativeActor.items.get("native-studded").system.armor.value, 3);
assert.equal(multipleNativeActor.items.get("native-chain").system.armor.value, 5);

await clearArmorProfile(profileActor);
assert.equal(studded.system.equipmentType, "armor");
assert.equal(studded.system.armor.value, 3);
assert.equal(chainmail.system.equipmentType, "armor");
assert.equal(profileActor.items.some((item) => item.name === "PAcS Armor Profile"), false);

const reconcileActor = actor([], {
  [MODULE_ID]: {
    [FLAGS.armorProfile]: {
      baselineItemId: "gone-baseline",
      slots: { torso: "gone-torso", arms: null, legs: "gone-legs" }
    }
  }
});
const reconciliation = reconcileArmorProfile(reconcileActor);
assert.equal(reconciliation.changed, true);
assert.equal(reconciliation.prunedBaseline, "gone-baseline");
assert.deepEqual(reconciliation.prunedSlots, [
  { category: "torso", itemId: "gone-torso" },
  { category: "legs", itemId: "gone-legs" }
]);
assert.equal(reconciliation.profile.baselineItemId, null);
assert.equal(reconciliation.profile.slots.torso, null);
assert.equal(reconciliation.profile.slots.legs, null);

const deleteTorso = equipment("delete-torso", "Studded Leather", { equipped: false });
const deleteArms = equipment("delete-arms", "Chainmail", { equipped: false, equipmentSubtype: "mediumArmor" });
const deleteLegs = equipment("delete-legs", "Studded Leather", { equipped: false });
const deleteOverrideActor = actor([deleteTorso, deleteArms, deleteLegs]);
await setArmorProfileSlot(deleteOverrideActor, "torso", "delete-torso");
await setArmorProfileSlot(deleteOverrideActor, "arms", "delete-arms");
await setArmorProfileSlot(deleteOverrideActor, "legs", "delete-legs");
assert.equal(resolveArmorProfile(deleteOverrideActor).summary.armorBonus, 4);
await deleteOverrideActor.deleteEmbeddedDocuments("Item", ["delete-torso"]);
const afterDeleteTorso = await applyArmorProfile(deleteOverrideActor, { migrateLegacy: false });
assert.deepEqual(afterDeleteTorso.reconciliation.prunedSlots, [{ category: "torso", itemId: "delete-torso" }]);
assert.equal(afterDeleteTorso.profile.slots.torso, null);
assert.equal(afterDeleteTorso.profile.slots.arms, "delete-arms");
assert.equal(afterDeleteTorso.profile.slots.legs, "delete-legs");
assert.equal(afterDeleteTorso.summary.armorBonus, 2);
assert.equal(deleteArms.system.equipmentType, "misc");
assert.equal(deleteArms.system.slot, PACS_EQUIPMENT_SLOTS.arms);
assert.equal(deleteLegs.system.equipmentType, "misc");
assert.equal(deleteLegs.system.slot, PACS_EQUIPMENT_SLOTS.legs);
assert.equal(deleteOverrideActor.items.find((item) => item.name === "PAcS Armor Profile").system.armor.value, 2);

const finalOverride = equipment("final-override", "Studded Leather", { equipped: false });
const finalOverrideActor = actor([finalOverride]);
await setArmorProfileSlot(finalOverrideActor, "arms", "final-override");
assert.equal(finalOverrideActor.items.some((item) => item.name === "PAcS Armor Profile"), true);
await finalOverrideActor.deleteEmbeddedDocuments("Item", ["final-override"]);
const afterFinalDelete = await applyArmorProfile(finalOverrideActor, { migrateLegacy: false });
assert.equal(afterFinalDelete.status, ARMOR_PROFILE_STATUS.empty);
assert.deepEqual(afterFinalDelete.reconciliation.prunedSlots, [{ category: "arms", itemId: "final-override" }]);
assert.equal(afterFinalDelete.profile.slots.arms, null);
carrier = finalOverrideActor.items.find((item) => item.name === "PAcS Armor Profile");
assert.equal(Boolean(carrier), true);
assert.equal(carrier.system.equipped, false);
assert.equal(carrier.system.armor.value, 0);
assert.equal(carrier.getFlag(MODULE_ID, FLAGS.internalArmor).suspended, true);
assert.equal(finalOverrideActor.lastDeleteOptions.d35ePacsProfile, undefined);

const deletedBaseline = equipment("deleted-baseline", "Studded Leather", {
  equipped: true,
  armor: { value: 3, enh: 0, dex: 5, acp: 0 },
  spellFailure: 15,
  weight: 20
});
const survivingLegs = equipment("surviving-legs", "Chainmail", { equipped: false, equipmentSubtype: "mediumArmor" });
const baselineDeleteActor = actor([deletedBaseline, survivingLegs]);
await setArmorProfileBaseline(baselineDeleteActor, "deleted-baseline");
await setArmorProfileSlot(baselineDeleteActor, "legs", "surviving-legs");
await baselineDeleteActor.deleteEmbeddedDocuments("Item", ["deleted-baseline"]);
const afterBaselineDelete = await applyArmorProfile(baselineDeleteActor, { migrateLegacy: false });
assert.equal(afterBaselineDelete.reconciliation.prunedBaseline, "deleted-baseline");
assert.equal(afterBaselineDelete.profile.baselineItemId, null);
assert.equal(afterBaselineDelete.profile.slots.legs, "surviving-legs");
assert.equal(afterBaselineDelete.baselineItem, null);
assert.equal(afterBaselineDelete.status, ARMOR_PROFILE_STATUS.compositeProfile);
assert.equal(afterBaselineDelete.summary.armorBonus, 0);
assert.equal(survivingLegs.system.equipmentType, "misc");
assert.equal(survivingLegs.system.slot, PACS_EQUIPMENT_SLOTS.legs);

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
assert.equal(resolved.summary.armorBonus, 5);
assert.equal(resolved.summary.completeSuit, false);

const materialObjectArmor = equipment("material-object", "Chainmail", {
  equipped: false,
  equipmentSubtype: "mediumArmor",
  material: {}
});
const materialObjectActor = actor([materialObjectArmor], {
  [MODULE_ID]: {
    [FLAGS.armorProfile]: {
      slots: { arms: "material-object" }
    }
  }
});
resolved = resolveArmorProfile(materialObjectActor);
assert.equal(resolved.summary.material.material, "");

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

const configuredHelmet = equipment("configured-helmet", "Full Plate Helm", {
  equipmentType: "misc",
  equipmentSubtype: "clothing",
  equipped: true,
  slot: PACS_EQUIPMENT_SLOTS.legs
}, {
  [MODULE_ID]: {
    [FLAGS.helmet]: {
      enabled: true,
      localArmorBonus: 8,
      coverageSlots: "head; eyes; ears"
    }
  }
});
const inferredHelmetActor = actor([configuredHelmet]);
resolved = resolveArmorProfile(inferredHelmetActor);
assert.equal(resolved.status, ARMOR_PROFILE_STATUS.empty);
assert.equal(resolved.profile.slots.legs, null);
assert.equal(resolved.summary.armorBonus, 0);

const explicitHelmetActor = actor([configuredHelmet], {
  [MODULE_ID]: {
    [FLAGS.armorProfile]: {
      slots: { legs: "configured-helmet" }
    }
  }
});
resolved = resolveArmorProfile(explicitHelmetActor);
assert.equal(resolved.status, ARMOR_PROFILE_STATUS.needsPieceValues);
assert.deepEqual(resolved.unresolved, [{
  category: "legs",
  itemId: "configured-helmet",
  itemName: "Full Plate Helm",
  reason: "unknownArmor"
}]);

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
