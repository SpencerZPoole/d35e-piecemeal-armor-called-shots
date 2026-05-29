import assert from "node:assert/strict";
import {
  LOCAL_ARMOR_AGGREGATION_MODES,
  LOCAL_ARMOR_MODES,
  MODULE_ID as CONST_MODULE_ID,
  SETTINGS
} from "../scripts/constants.js";
import { armorCoverageOverlaps, parseArmorCoverageSlots } from "../scripts/armor.js";
import {
  applyLocalArmorAdjustment,
  applyCalledShotConcealmentAdjustment,
  applyStagedCalledShotLocalArmor,
  attachCalledShotToDamageCard,
  calculateActiveArmorContribution,
  calculateLocalArmorAdjustment,
  clearStagedCalledShotDamageApplication,
  extractCalledShotDamagePayloads,
  getStagedCalledShotDamageApplication,
  normalizeArmorSlot,
  sanitizeCalledShotDamagePayload,
  stageCalledShotDamageApplication
} from "../scripts/local-armor.js";

const MODULE_ID = CONST_MODULE_ID;

let exposedHeadshots = false;
let exposedHandShots = false;
let localArmorEnabled = false;
let localArmorAggregation = LOCAL_ARMOR_AGGREGATION_MODES.sum;
let localArmorAggregationMap = {};
let localArmorLocations = {};
let localArmorCoverageMap = {};
let armorAutomationEnabled = true;
let calledShotsEnabled = true;

globalThis.game = {
  user: { id: "gm-1" },
  settings: {
    get(moduleId, key) {
      assert.equal(moduleId, MODULE_ID);
      if (key === "calledShotLocalArmorMode") return LOCAL_ARMOR_MODES.adjust;
      if (key === "rulesMode") return "rawAdapted";
      if (key === "armorWorkflowMode") return "nativeProfile";
      if (key === "enableHelmetHeadCoverage") return false;
      if (key === "enableHelmetSkillPenalties") return false;
      if (key === SETTINGS.enableArmor) return armorAutomationEnabled;
      if (key === SETTINGS.enableCalledShots) return calledShotsEnabled;
      if (key === "enableExposedHeadshots") return exposedHeadshots;
      if (key === "enableExposedHandShots") return exposedHandShots;
      if (key === "enableCalledShotLocalArmor") return localArmorEnabled;
      if (key === "calledShotLocalArmorAggregation") return localArmorAggregation;
      if (key === SETTINGS.calledShotLocalArmorAggregationMap) return localArmorAggregationMap;
      if (key === "calledShotLocalArmorLocations") return localArmorLocations;
      if (key === SETTINGS.calledShotLocalArmorCoverageMap) return localArmorCoverageMap;
      return true;
    }
  }
};

function itemGetFlag(moduleId, key) {
  return this.flags?.[moduleId]?.[key];
}

function aggregate(armorBonus, enhancementBonus = 0, equipped = true) {
  return {
    id: "aggregate",
    name: "PAcS Armor Profile",
    type: "equipment",
    system: {
      equipped,
      armor: { value: armorBonus + enhancementBonus, enh: 0 }
    },
    flags: {
      [MODULE_ID]: {
        aggregate: {
          isAggregate: true,
          summary: { armorBonus, enhancementBonus }
        },
        internalArmor: { isInternal: true }
      }
    },
    getFlag: itemGetFlag
  };
}

function nativeArmor(id, name, equipped = false, armorBonus = 0, enhancementBonus = 0) {
  return {
    id,
    name,
    type: "equipment",
    system: {
      carried: true,
      equipped,
      equipmentType: "armor",
      armor: { value: armorBonus, enh: enhancementBonus },
      slot: "armor",
      melded: false
    },
    flags: {},
    getFlag: itemGetFlag
  };
}

function nativeSlotItem(id, slot, equipped = true, options = {}) {
  const flags = options.flags ? JSON.parse(JSON.stringify(options.flags)) : {};
  if (Object.prototype.hasOwnProperty.call(options, "localArmorBonus")) {
    flags[MODULE_ID] = flags[MODULE_ID] ?? {};
    flags[MODULE_ID].helmet = {
      ...(flags[MODULE_ID].helmet ?? {}),
      enabled: true,
      localArmorBonus: options.localArmorBonus
    };
  }
  if (Object.prototype.hasOwnProperty.call(options, "armorBonus")) {
    flags[MODULE_ID] = flags[MODULE_ID] ?? {};
    flags[MODULE_ID].helmet = {
      ...(flags[MODULE_ID].helmet ?? {}),
      enabled: true,
      armorBonus: options.armorBonus,
      enhancementBonus: options.enhancementBonus ?? 0
    };
  }
  return {
    id,
    name: options.name ?? `${slot} item`,
    type: options.type ?? "equipment",
    system: {
      carried: options.carried ?? true,
      equipped,
      equipmentType: "misc",
      armor: { value: options.systemArmorBonus ?? 0, enh: options.systemEnhancementBonus ?? 0 },
      slot,
      melded: options.melded ?? false
    },
    flags,
    getFlag: itemGetFlag
  };
}

const aggregateActor = {
  id: "target-actor",
  uuid: "Actor.target-actor",
  system: {
    attributes: {
      ac: {
        normal: { total: 21 },
        touch: { total: 12 }
      }
    }
  },
  items: [aggregate(4, 1)],
  getActiveTokens() {
    return [{ document: { uuid: "Scene.scene.Token.target-token" } }];
  }
};

const profileActor = {
  id: "profile-target",
  uuid: "Actor.profile-target",
  flags: {
    [MODULE_ID]: {
      armorProfile: {
        baselineItemId: "studded",
        slots: { legs: "chainmail" }
      }
    }
  },
  items: [
    nativeArmor("studded", "Studded Leather Armor", true),
    nativeArmor("chainmail", "Chainmail", false)
  ],
  getFlag: itemGetFlag
};

const nativeArmorActor = {
  id: "native-target",
  uuid: "Actor.native-target",
  items: [nativeArmor("chainmail", "Chainmail", true, 5, 1)],
  getFlag: itemGetFlag
};

const customNativeArmorActor = {
  id: "custom-native-target",
  uuid: "Actor.custom-native-target",
  items: [nativeArmor("mystery", "Mystery Armor", true, 5, 0)],
  getFlag: itemGetFlag
};

assert.equal(normalizeArmorSlot("Leg"), "legs");
assert.equal(normalizeArmorSlot("Feet"), "legs");
assert.equal(normalizeArmorSlot("Eye"), "head");
assert.equal(normalizeArmorSlot("Vitals"), "torso");
assert.deepEqual(parseArmorCoverageSlots("head; eyes, ears|face/neck"), ["head", "neck"]);
assert.equal(armorCoverageOverlaps("head; eyes; ears", "ear"), true);
assert.equal(armorCoverageOverlaps("legs", "head"), false);

assert.equal(calculateLocalArmorAdjustment(aggregateActor, "legs"), null);
assert.equal(calculateLocalArmorAdjustment(aggregateActor, "hands"), null);
assert.equal(calculateLocalArmorAdjustment(profileActor, "head"), null);
assert.equal(calculateActiveArmorContribution(aggregateActor).total, 5);
assert.equal(calculateActiveArmorContribution(nativeArmorActor).total, 6);

localArmorEnabled = true;
localArmorAggregation = LOCAL_ARMOR_AGGREGATION_MODES.sum;
localArmorLocations = {};
const profileChestLocal = calculateLocalArmorAdjustment(profileActor, { locationId: "chest", locationLabel: "Chest", coverageSlot: "torso; chest" });
assert.equal(profileChestLocal.source, "localArmor");
assert.equal(profileChestLocal.aggregateTotal, 2);
assert.equal(profileChestLocal.localTotal, 1);
assert.equal(profileChestLocal.adjustment, -1);
assert.equal(profileChestLocal.profileSourceLabel, "profile");

const nativeHeadLocal = calculateLocalArmorAdjustment(nativeArmorActor, { locationId: "head", locationLabel: "Head", coverageSlot: "head" });
assert.equal(nativeHeadLocal.source, "localArmor");
assert.equal(nativeHeadLocal.aggregateTotal, 6);
assert.equal(nativeHeadLocal.localTotal, 0);
assert.equal(nativeHeadLocal.adjustment, -6);
assert.equal(nativeHeadLocal.profileSourceLabel, "full armor");

const layeredEyeActor = {
  ...aggregateActor,
  items: [
    aggregate(4, 1),
    nativeSlotItem("goggles", "eyes", true, { systemArmorBonus: 1 }),
    nativeSlotItem("helmet", "head", true, { localArmorBonus: 2 }),
    nativeSlotItem("headband", "headband", true, { systemArmorBonus: 1 })
  ]
};
const summedEye = calculateLocalArmorAdjustment(layeredEyeActor, { locationId: "eye", locationLabel: "Eye", coverageSlot: "head; eyes" });
assert.equal(summedEye.source, "localArmor");
assert.equal(summedEye.aggregateTotal, 5);
assert.equal(summedEye.localTotal, 4);
assert.equal(summedEye.adjustment, -1);
assert.equal(summedEye.aggregation, LOCAL_ARMOR_AGGREGATION_MODES.sum);

localArmorAggregation = LOCAL_ARMOR_AGGREGATION_MODES.highest;
const highestEye = calculateLocalArmorAdjustment(layeredEyeActor, { locationId: "eye", locationLabel: "Eye", coverageSlot: "head; eyes" });
assert.equal(highestEye.localTotal, 2);
assert.equal(highestEye.adjustment, -3);
assert.equal(highestEye.aggregation, LOCAL_ARMOR_AGGREGATION_MODES.highest);
localArmorAggregation = LOCAL_ARMOR_AGGREGATION_MODES.sum;

localArmorCoverageMap = { eye: { pacs: [], native: ["head"] } };
const headOnlyEye = calculateLocalArmorAdjustment(layeredEyeActor, { locationId: "eye", locationLabel: "Eye", coverageSlot: "head; eyes" });
assert.equal(headOnlyEye.source, "localArmor");
assert.equal(headOnlyEye.localTotal, 2);
assert.equal(headOnlyEye.nativeItems.map((item) => item.id).join(","), "helmet");

localArmorCoverageMap = { eye: { pacs: [], native: [] } };
const explicitlyUncoveredEye = calculateLocalArmorAdjustment(layeredEyeActor, { locationId: "eye", locationLabel: "Eye", coverageSlot: "head; eyes" });
assert.equal(explicitlyUncoveredEye.source, "localArmor");
assert.equal(explicitlyUncoveredEye.localTotal, 0);
assert.equal(explicitlyUncoveredEye.adjustment, -5);
localArmorCoverageMap = {};

localArmorAggregation = LOCAL_ARMOR_AGGREGATION_MODES.perLocation;
localArmorAggregationMap = { eye: LOCAL_ARMOR_AGGREGATION_MODES.highest };
const perLocationHighestEye = calculateLocalArmorAdjustment(layeredEyeActor, { locationId: "eye", locationLabel: "Eye", coverageSlot: "head; eyes" });
assert.equal(perLocationHighestEye.localTotal, 2);
assert.equal(perLocationHighestEye.adjustment, -3);
assert.equal(perLocationHighestEye.aggregation, LOCAL_ARMOR_AGGREGATION_MODES.highest);
localArmorAggregationMap = {};
const perLocationDefaultEye = calculateLocalArmorAdjustment(layeredEyeActor, { locationId: "eye", locationLabel: "Eye", coverageSlot: "head; eyes" });
assert.equal(perLocationDefaultEye.localTotal, 4);
assert.equal(perLocationDefaultEye.aggregation, LOCAL_ARMOR_AGGREGATION_MODES.sum);
localArmorAggregationMap = { eye: "stack-everything-twice" };
const invalidPerLocationEye = calculateLocalArmorAdjustment(layeredEyeActor, { locationId: "eye", locationLabel: "Eye", coverageSlot: "head; eyes" });
assert.equal(invalidPerLocationEye.localTotal, 4);
assert.equal(invalidPerLocationEye.aggregation, LOCAL_ARMOR_AGGREGATION_MODES.sum);
localArmorAggregationMap = {};
localArmorAggregation = LOCAL_ARMOR_AGGREGATION_MODES.sum;

const wristArmActor = {
  ...profileActor,
  items: [...profileActor.items, nativeSlotItem("wrist-guards", "wrists", true, { localArmorBonus: 2 })]
};
const armWithWrist = calculateLocalArmorAdjustment(wristArmActor, { locationId: "arm", locationLabel: "Arm or Wing", coverageSlot: "arms" });
assert.equal(armWithWrist.source, "localArmor");
assert.equal(armWithWrist.localTotal, 2);
assert.equal(armWithWrist.sources.some((source) => source.nativeSlot === "wrists"), true);

const handNoGear = calculateLocalArmorAdjustment(profileActor, { locationId: "hand", locationLabel: "Hand", coverageSlot: "hands" });
assert.equal(handNoGear.source, "localArmor");
assert.equal(handNoGear.localTotal, 0);
assert.equal(handNoGear.pieces.length, 0);
const handNoValueGear = calculateLocalArmorAdjustment({
  ...profileActor,
  items: [...profileActor.items, nativeSlotItem("plain-gloves", "hands")]
}, { locationId: "hand", locationLabel: "Hand", coverageSlot: "hands" });
assert.equal(handNoValueGear.source, "localArmor");
assert.equal(handNoValueGear.localTotal, 0);
assert.equal(handNoValueGear.nativeItems.length, 1);
const customCoveredLocation = calculateLocalArmorAdjustment(profileActor, {
  locationId: "tail",
  locationLabel: "Tail",
  coverageSlot: "legs"
});
assert.equal(customCoveredLocation.source, "localArmor");
assert.equal(customCoveredLocation.localTotal, 0);
localArmorLocations = { tail: false };
assert.equal(calculateLocalArmorAdjustment(profileActor, {
  locationId: "tail",
  locationLabel: "Tail",
  coverageSlot: "legs"
}), null);

localArmorLocations = { head: false };
assert.equal(calculateLocalArmorAdjustment(nativeArmorActor, { locationId: "head", locationLabel: "Head", coverageSlot: "head" }), null);
localArmorLocations = {};
assert.equal(calculateLocalArmorAdjustment(customNativeArmorActor, { locationId: "head", locationLabel: "Head", coverageSlot: "head" }), null);
localArmorEnabled = false;

localArmorEnabled = true;
armorAutomationEnabled = false;
assert.equal(calculateLocalArmorAdjustment(profileActor, { locationId: "chest", locationLabel: "Chest", coverageSlot: "torso; chest" }), null);
armorAutomationEnabled = true;
calledShotsEnabled = false;
assert.equal(calculateLocalArmorAdjustment(profileActor, { locationId: "chest", locationLabel: "Chest", coverageSlot: "torso; chest" }), null);
localArmorEnabled = false;
exposedHeadshots = true;
assert.equal(calculateLocalArmorAdjustment(aggregateActor, "head"), null);
calledShotsEnabled = true;
exposedHeadshots = false;

exposedHeadshots = true;
const exposedHead = calculateLocalArmorAdjustment(aggregateActor, "head");
assert.equal(exposedHead.aggregateTotal, 5);
assert.equal(exposedHead.localTotal, 0);
assert.equal(exposedHead.adjustment, -5);
assert.equal(exposedHead.source, "exposed");
assert.equal(exposedHead.nativeSlot, "head");

assert.equal(calculateLocalArmorAdjustment({
  ...aggregateActor,
  items: [aggregate(4, 1), nativeSlotItem("helmet", "head")]
}, "ear"), null);
assert.equal(calculateLocalArmorAdjustment({
  ...aggregateActor,
  items: [aggregate(4, 1), nativeSlotItem("pacs-helmet", "head", true, { name: "[PAcS] Leather Cap" })]
}, "eye"), null);
assert.equal(calculateLocalArmorAdjustment({
  ...aggregateActor,
  items: [aggregate(4, 1), nativeSlotItem("unequipped-helmet", "head", false)]
}, "head").adjustment, -5);
assert.equal(calculateLocalArmorAdjustment({
  ...aggregateActor,
  items: [aggregate(4, 1), nativeSlotItem("uncarried-helmet", "head", true, { carried: false })]
}, "head").adjustment, -5);
assert.equal(calculateLocalArmorAdjustment({
  ...aggregateActor,
  items: [aggregate(4, 1), nativeSlotItem("melded-helmet", "head", true, { melded: true })]
}, "head").adjustment, -5);
assert.equal(calculateLocalArmorAdjustment({
  ...aggregateActor,
  items: [aggregate(4, 1), nativeSlotItem("non-equipment-helmet", "head", true, { type: "loot" })]
}, "head").adjustment, -5);
assert.equal(calculateLocalArmorAdjustment({
  ...aggregateActor,
  items: [aggregate(4, 1), nativeSlotItem("headband", "headband", true)]
}, "ear"), null);
assert.equal(calculateLocalArmorAdjustment({
  ...aggregateActor,
  items: [aggregate(4, 1), nativeSlotItem("goggles", "eyes", true)]
}, "eye"), null);

const profileHead = calculateLocalArmorAdjustment(profileActor, "head");
assert.equal(profileHead.aggregateTotal, 2);
assert.equal(profileHead.adjustment, -2);

const nativeHead = calculateLocalArmorAdjustment(nativeArmorActor, "eye");
assert.equal(nativeHead.aggregateTotal, 6);
assert.equal(nativeHead.adjustment, -6);

localArmorCoverageMap = { eye: { pacs: [], native: ["head"] } };
assert.equal(calculateLocalArmorAdjustment({
  ...aggregateActor,
  items: [aggregate(4, 1), nativeSlotItem("goggles", "eyes", true)]
}, "eye").adjustment, -5);
assert.equal(calculateLocalArmorAdjustment({
  ...aggregateActor,
  items: [aggregate(4, 1), nativeSlotItem("helmet", "head", true)]
}, "eye"), null);
localArmorCoverageMap = { eye: { pacs: [], native: [] } };
const exposedEmptyMapEye = calculateLocalArmorAdjustment(aggregateActor, "eye");
assert.equal(exposedEmptyMapEye.source, "exposed");
assert.equal(exposedEmptyMapEye.nativeSlot, null);
assert.equal(exposedEmptyMapEye.adjustment, -5);
localArmorCoverageMap = {};

exposedHeadshots = false;
exposedHandShots = true;
localArmorEnabled = true;
localArmorLocations = {};
const localHand = calculateLocalArmorAdjustment(profileActor, { locationId: "hand", locationLabel: "Hand", coverageSlot: "hands" });
assert.equal(localHand.source, "localArmor");
assert.equal(localHand.aggregateTotal, 2);
assert.equal(localHand.localTotal, 0);
assert.equal(localHand.adjustment, -2);
localArmorLocations = { hand: false };
const exposedHand = calculateLocalArmorAdjustment(aggregateActor, "hands");
assert.equal(exposedHand.aggregateTotal, 5);
assert.equal(exposedHand.nativeSlot, "hands");
assert.equal(exposedHand.adjustment, -5);
assert.equal(calculateLocalArmorAdjustment({
  ...aggregateActor,
  items: [aggregate(4, 1), nativeSlotItem("gloves", "hands")]
}, "hand"), null);
assert.equal(calculateLocalArmorAdjustment({
  ...aggregateActor,
  items: [aggregate(4, 1), nativeSlotItem("bracers", "wrists")]
}, "hand"), null);
assert.equal(calculateLocalArmorAdjustment({
  ...aggregateActor,
  items: [aggregate(4, 1), nativeSlotItem("pacs-gloves", "hands", true, { name: "[PAcS] Gloves" })]
}, "hand"), null);
assert.equal(calculateLocalArmorAdjustment({
  ...aggregateActor,
  items: [aggregate(4, 1), nativeSlotItem("unequipped-gloves", "hands", false)]
}, "hand").adjustment, -5);
assert.equal(calculateLocalArmorAdjustment({
  ...aggregateActor,
  items: [aggregate(4, 1), nativeSlotItem("uncarried-gloves", "hands", true, { carried: false })]
}, "hand").adjustment, -5);
assert.equal(calculateLocalArmorAdjustment({
  ...aggregateActor,
  items: [aggregate(4, 1), nativeSlotItem("melded-gloves", "hands", true, { melded: true })]
}, "hand").adjustment, -5);
assert.equal(calculateLocalArmorAdjustment({
  ...aggregateActor,
  items: [aggregate(4, 1), nativeSlotItem("ring", "ring", true)]
}, "hand").adjustment, -5);
localArmorEnabled = false;
localArmorLocations = {};

const payload = sanitizeCalledShotDamagePayload({
  userId: "gm-1",
  actorId: "attacker",
  itemId: "sword",
  targetUuid: "Scene.scene.Token.target-token",
  profileId: "profile",
  locationId: "leg",
  locationLabel: "Leg",
  penalty: -2,
  coverageSlot: "legs"
});
assert.equal(payload.locationLabel, "Leg");
assert.equal(payload.penalty, -2);

const card = attachCalledShotToDamageCard({ label: "Apply" }, payload);
assert.equal(card.d35ePacsCalledShot.locationId, "leg");
assert.deepEqual(extractCalledShotDamagePayloads({
  dc: { isHalf: true },
  attacks: [{ cards: [card], altCards: [card] }]
}).map((entry) => entry?.locationId), ["leg", "leg", "leg"]);

const handPayload = sanitizeCalledShotDamagePayload({
  userId: "gm-1",
  actorId: "attacker",
  itemId: "sword",
  targetUuid: "Scene.scene.Token.target-token",
  profileId: "profile",
  locationId: "hand",
  locationLabel: "Hand",
  penalty: -5,
  coverageSlot: "hands"
});
const handAc = { ac: 21, acModifiers: [{ sourceName: "AC", value: 21 }] };
const exposedApplied = applyLocalArmorAdjustment(aggregateActor, handAc, handPayload);
assert.equal(exposedApplied.adjusted, true);
assert.equal(handAc.ac, 16);
assert.equal(handAc.acModifiers.at(-1).sourceName, "Called Shot Exposed Hand: no Hands/Wrists item (armor 5 -> 0)");
assert.equal(handAc.acModifiers.at(-1).value, "-5");

exposedHandShots = false;
localArmorEnabled = true;
localArmorLocations = {};
const localHandAc = { ac: 21, acModifiers: [{ sourceName: "AC", value: 21 }] };
const localHandApplied = applyLocalArmorAdjustment(profileActor, localHandAc, handPayload);
assert.equal(localHandApplied.source, "localArmor");
assert.equal(localHandAc.ac, 19);
assert.equal(localHandAc.acModifiers.at(-1).sourceName, "Called Shot Local Armor: Hand (profile 2 -> local sources 0)");
exposedHandShots = true;
const localBeforeExposedAc = { ac: 21, acModifiers: [{ sourceName: "AC", value: 21 }] };
const localBeforeExposed = applyLocalArmorAdjustment(profileActor, localBeforeExposedAc, handPayload);
assert.equal(localBeforeExposed.source, "localArmor");
assert.equal(localBeforeExposedAc.ac, 19);
assert.equal(localBeforeExposedAc.acModifiers.length, 2);
localArmorLocations = { hand: false };
const normalAc = { ac: 21, acModifiers: [{ sourceName: "AC", value: 21 }] };
const fallbackExposed = applyLocalArmorAdjustment(aggregateActor, normalAc, handPayload);
assert.equal(fallbackExposed.source, "exposed");
assert.equal(normalAc.ac, 16);
assert.equal(normalAc.acModifiers.at(-1).sourceName, "Called Shot Exposed Hand: no Hands/Wrists item (armor 5 -> 0)");
localArmorEnabled = false;
exposedHandShots = false;
localArmorLocations = {};

const coverAc = { ac: 25, acModifiers: [{ sourceName: "Cover", value: "+4" }] };
applyLocalArmorAdjustment(aggregateActor, coverAc, payload, { mode: LOCAL_ARMOR_MODES.display });
assert.equal(coverAc.ac, 29);
assert.equal(coverAc.acModifiers.some((entry) => entry.sourceName === "Called Shot Cover"), true);

const touchAc = { ac: 12, acModifiers: [{ sourceName: "AC", value: 12 }] };
const touchCalledShot = applyLocalArmorAdjustment(aggregateActor, touchAc, payload);
assert.equal(touchCalledShot.adjustment, 9);
assert.equal(touchAc.ac, 21);

exposedHeadshots = true;
const headPayload = sanitizeCalledShotDamagePayload({
  userId: "gm-1",
  actorId: "attacker",
  itemId: "sword",
  targetUuid: "Scene.scene.Token.target-token",
  profileId: "profile",
  locationId: "head",
  locationLabel: "Head",
  penalty: -5,
  coverageSlot: "head"
});
const displayAc = { ac: 21, acModifiers: [] };
const displayed = applyLocalArmorAdjustment(aggregateActor, displayAc, headPayload, { mode: LOCAL_ARMOR_MODES.display });
assert.equal(displayed.adjusted, false);
assert.equal(displayAc.ac, 21);
assert.match(displayAc.acModifiers.at(-1).sourceName, /advisory/);

clearStagedCalledShotDamageApplication("gm-1");
stageCalledShotDamageApplication(payload, { userId: "gm-1", messageId: "msg-1" });
assert.equal(getStagedCalledShotDamageApplication("gm-1").messageId, "msg-1");
assert.equal(getStagedCalledShotDamageApplication("gm-1", Date.now() + 2 * 60 * 1000).messageId, "msg-1");
assert.equal(getStagedCalledShotDamageApplication("gm-1", Date.now() + 6 * 60 * 1000), null);
stageCalledShotDamageApplication(payload, { userId: "gm-1", messageId: "msg-2" });
const conceal = { concealTarget: 20 };
assert.deepEqual(applyCalledShotConcealmentAdjustment(aggregateActor, conceal, "gm-1"), { original: 20, adjusted: 50 });
assert.equal(conceal.concealTarget, 50);

clearStagedCalledShotDamageApplication("gm-1");
stageCalledShotDamageApplication(headPayload, { userId: "gm-1", messageId: "msg-head" });
const stagedHeadAc = { ac: 21, acModifiers: [] };
const stagedHead = applyStagedCalledShotLocalArmor(aggregateActor, stagedHeadAc, "gm-1");
assert.equal(stagedHead.adjustment, -5);
assert.equal(stagedHeadAc.ac, 16);
assert.equal(stagedHeadAc.acModifiers.at(-1).sourceName, "Called Shot Exposed Head: no Head/Headband item (armor 5 -> 0)");

console.log("test-local-armor: ok");
