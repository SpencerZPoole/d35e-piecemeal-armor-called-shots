import assert from "node:assert/strict";
import { MODULE_ID } from "../scripts/constants.js";
import { resolveArmorProfile } from "../scripts/armor-profile.js";
import { applyHelmetSkillPenaltyToHookData, calculateHelmetLocalArmor, HELMET_LOCAL_ARMOR_BY_FAMILY } from "../scripts/helmet.js";
import { applyLocalArmorAdjustment, calculateLocalArmorAdjustment } from "../scripts/local-armor.js";

let legacyHelmetCoverageEnabled = false;
let exposedHeadshotsEnabled = false;
let helmetSkillPenaltiesEnabled = false;
let defaultSpotPenalty = -2;
let defaultListenPenalty = -2;

globalThis.game = {
  settings: {
    get(moduleId, key) {
      assert.equal(moduleId, MODULE_ID);
      if (key === "enableHelmetHeadCoverage") return legacyHelmetCoverageEnabled;
      if (key === "enableExposedHeadshots") return exposedHeadshotsEnabled;
      if (key === "enableExposedHandShots") return false;
      if (key === "enableCalledShotLocalArmor") return false;
      if (key === "calledShotLocalArmorAggregation") return "sum";
      if (key === "calledShotLocalArmorAggregationMap") return {};
      if (key === "calledShotLocalArmorLocations") return {};
      if (key === "enableHelmetSkillPenalties") return helmetSkillPenaltiesEnabled;
      if (key === "defaultHelmetSpotPenalty") return defaultSpotPenalty;
      if (key === "defaultHelmetListenPenalty") return defaultListenPenalty;
      if (key === "enableArmorAutomation") return true;
      if (key === "enableCalledShots") return true;
      if (key === "armorWorkflowMode") return "nativeProfile";
      if (key === "rulesMode") return "rawAdapted";
      return true;
    }
  }
};

function itemGetFlag(moduleId, key) {
  return this.flags?.[moduleId]?.[key];
}

function nativeArmor(id, name, equipped = false) {
  return {
    id,
    name,
    type: "equipment",
    system: {
      carried: true,
      equipped,
      equipmentType: "armor",
      equipmentSubtype: "lightArmor",
      armor: { value: 0, enh: 0 },
      spellFailure: 0,
      weight: 0,
      slot: "armor",
      melded: false
    },
    flags: {},
    getFlag: itemGetFlag
  };
}

function helmet(id, options = {}) {
  return {
    id,
    name: options.name ?? "Test Helmet",
    type: "equipment",
    system: {
      carried: true,
      equipped: options.equipped ?? true,
      equipmentType: "misc",
      slot: options.slot ?? "head",
      armor: { value: 0, enh: 0, dex: null, acp: 0 },
      spellFailure: 0,
      weight: 3,
      melded: false
    },
    flags: {
      [MODULE_ID]: {
        helmet: {
          enabled: options.enabled ?? true,
          armorFamily: options.armorFamily ?? "plate",
          localArmorBonus: options.localArmorBonus ?? "",
          coverageSlots: options.coverageSlots ?? "head; eyes; ears",
          spotPenalty: options.spotPenalty ?? 2,
          listenPenalty: options.listenPenalty ?? -4
        }
      }
    },
    getFlag: itemGetFlag
  };
}

function headgear(id, options = {}) {
  return {
    id,
    name: options.name ?? "Ordinary Hat",
    type: "equipment",
    system: {
      carried: true,
      equipped: options.equipped ?? true,
      equipmentType: "misc",
      slot: options.slot ?? "head",
      armor: { value: 0, enh: 0 },
      spellFailure: 0,
      weight: 1,
      melded: false
    },
    flags: {},
    getFlag: itemGetFlag
  };
}

function profileActor(extraItems = []) {
  const items = [
    nativeArmor("studded", "Studded Leather Armor", true),
    nativeArmor("chainmail", "Chainmail", false),
    ...extraItems
  ];
  items.get = (id) => items.find((item) => item.id === id) ?? null;
  return {
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
    items,
    getFlag: itemGetFlag
  };
}

assert.equal(HELMET_LOCAL_ARMOR_BY_FAMILY["chain-shirt"], 4);
assert.equal(HELMET_LOCAL_ARMOR_BY_FAMILY["chain"], 5);
assert.equal(HELMET_LOCAL_ARMOR_BY_FAMILY["plate"], 8);
assert.equal(HELMET_LOCAL_ARMOR_BY_FAMILY["half-plate"], 7);
assert.equal(HELMET_LOCAL_ARMOR_BY_FAMILY["full-plate"], 8);
const plateHelmet = helmet("plate-helm");
assert.equal(calculateHelmetLocalArmor(plateHelmet).localArmorBonus, 8);
const customHelmet = helmet("custom-helm", { localArmorBonus: 3 });
assert.equal(calculateHelmetLocalArmor(customHelmet).localArmorBonus, 3);

const actorWithHelmet = profileActor([plateHelmet]);
const resolved = resolveArmorProfile(actorWithHelmet);
assert.equal(resolved.summary.armorBonus, 2);
assert.equal(resolved.summary.activePieces.some((piece) => piece.id === "plate-helm"), false);

legacyHelmetCoverageEnabled = true;
assert.equal(calculateLocalArmorAdjustment(actorWithHelmet, "head"), null);
assert.equal(calculateLocalArmorAdjustment(profileActor(), "head"), null);

exposedHeadshotsEnabled = true;
const noHelmetHead = calculateLocalArmorAdjustment(profileActor(), "head");
assert.equal(noHelmetHead.aggregateTotal, 2);
assert.equal(noHelmetHead.localTotal, 0);
assert.equal(noHelmetHead.adjustment, -2);
assert.equal(noHelmetHead.source, "exposed");
assert.equal(noHelmetHead.nativeSlot, "head");

assert.equal(calculateLocalArmorAdjustment(actorWithHelmet, "head"), null);
assert.equal(calculateLocalArmorAdjustment(actorWithHelmet, "ear"), null);
assert.equal(calculateLocalArmorAdjustment(actorWithHelmet, "eye"), null);

const ignoredBeltHelmet = calculateLocalArmorAdjustment(profileActor([helmet("belt-helm", { slot: "belt" })]), "head");
assert.equal(ignoredBeltHelmet.adjustment, -2);
const disabledFlagHelmet = calculateLocalArmorAdjustment(profileActor([helmet("plain-headgear", { enabled: false })]), "head");
assert.equal(disabledFlagHelmet, null);

const noHelmetAc = { ac: 19, acModifiers: [] };
applyLocalArmorAdjustment(profileActor(), noHelmetAc, { locationLabel: "Head", coverageSlot: "head" });
assert.equal(noHelmetAc.ac, 17);
assert.equal(noHelmetAc.acModifiers.at(-1).sourceName, "Called Shot Exposed Head: no Head/Headband item (armor 2 -> 0)");

const helmetAc = { ac: 19, acModifiers: [] };
assert.equal(applyLocalArmorAdjustment(actorWithHelmet, helmetAc, { locationLabel: "Head", coverageSlot: "head" }), null);
assert.equal(helmetAc.ac, 19);

helmetSkillPenaltiesEnabled = false;
let hookData = { skillSourceDetails: [] };
assert.equal(applyHelmetSkillPenaltyToHookData(actorWithHelmet, "spt", hookData), null);
assert.deepEqual(hookData.skillSourceDetails, []);

helmetSkillPenaltiesEnabled = true;
hookData = { skillSourceDetails: [] };
const spotPenalty = applyHelmetSkillPenaltyToHookData(actorWithHelmet, "spt", hookData);
assert.equal(spotPenalty.penalty, -2);
assert.deepEqual(hookData.skillSourceDetails, [{ name: "Helmet (Test Helmet)", value: -2 }]);

hookData = { skillSourceDetails: [] };
const listenPenalty = applyHelmetSkillPenaltyToHookData(actorWithHelmet, "lis", hookData);
assert.equal(listenPenalty.penalty, -4);
assert.deepEqual(hookData.skillSourceDetails, [{ name: "Helmet (Test Helmet)", value: -4 }]);

hookData = { skillSourceDetails: [] };
const defaultSpot = applyHelmetSkillPenaltyToHookData(profileActor([headgear("hat")]), "spt", hookData);
assert.equal(defaultSpot.penalty, -2);
assert.equal(defaultSpot.source, "default");
assert.deepEqual(hookData.skillSourceDetails, [{ name: "Helmet (Ordinary Hat)", value: -2 }]);

hookData = { skillSourceDetails: [] };
const defaultListen = applyHelmetSkillPenaltyToHookData(profileActor([headgear("hat")]), "lis", hookData);
assert.equal(defaultListen.penalty, -2);
assert.deepEqual(hookData.skillSourceDetails, [{ name: "Helmet (Ordinary Hat)", value: -2 }]);

hookData = { skillSourceDetails: [] };
const blankConfigured = applyHelmetSkillPenaltyToHookData(profileActor([
  helmet("blank-helm", { name: "Blank Helm", spotPenalty: "", listenPenalty: "" })
]), "spt", hookData);
assert.equal(blankConfigured.penalty, -2);
assert.equal(blankConfigured.source, "default");

hookData = { skillSourceDetails: [] };
assert.equal(applyHelmetSkillPenaltyToHookData(profileActor([
  helmet("zero-helm", { name: "Zero Helm", spotPenalty: 0, listenPenalty: 0 })
]), "spt", hookData), null);
assert.deepEqual(hookData.skillSourceDetails, []);

hookData = { skillSourceDetails: [] };
assert.equal(applyHelmetSkillPenaltyToHookData(profileActor([headgear("belt-hat", { slot: "belt" })]), "spt", hookData), null);
assert.deepEqual(hookData.skillSourceDetails, []);

defaultSpotPenalty = 0;
hookData = { skillSourceDetails: [] };
assert.equal(applyHelmetSkillPenaltyToHookData(profileActor([headgear("no-default-hat")]), "spt", hookData), null);
assert.deepEqual(hookData.skillSourceDetails, []);
defaultSpotPenalty = -2;

hookData = { skillSourceDetails: [] };
assert.equal(applyHelmetSkillPenaltyToHookData(actorWithHelmet, "jmp", hookData), null);
assert.deepEqual(hookData.skillSourceDetails, []);

const mildPenaltyHelmet = helmet("mild-penalty", { name: "Mild Helm", spotPenalty: 1, listenPenalty: 1 });
const severePenaltyHelmet = helmet("severe-penalty", { name: "Severe Helm", spotPenalty: 5, listenPenalty: 3 });
let warningText = "";
const originalWarn = console.warn;
console.warn = (message) => {
  warningText = String(message);
};
hookData = { skillSourceDetails: [] };
const largestSpotPenalty = applyHelmetSkillPenaltyToHookData(profileActor([mildPenaltyHelmet, severePenaltyHelmet]), "spt", hookData);
console.warn = originalWarn;
assert.equal(largestSpotPenalty.penalty, -5);
assert.deepEqual(hookData.skillSourceDetails, [{ name: "Helmet (Severe Helm)", value: -5 }]);
assert.match(warningText, /Multiple configured helmets/);

console.log("test-helmet: ok");
