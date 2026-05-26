import assert from "node:assert/strict";
import { MODULE_ID } from "../scripts/constants.js";
import { resolveArmorProfile } from "../scripts/armor-profile.js";
import { applyHelmetSkillPenaltyToHookData, calculateHelmetLocalArmor, HELMET_LOCAL_ARMOR_BY_FAMILY } from "../scripts/helmet.js";
import { applyLocalArmorAdjustment, calculateLocalArmorAdjustment } from "../scripts/local-armor.js";

let helmetCoverageEnabled = false;
let helmetSkillPenaltiesEnabled = false;

globalThis.game = {
  settings: {
    get(moduleId, key) {
      assert.equal(moduleId, MODULE_ID);
      if (key === "enableHelmetHeadCoverage") return helmetCoverageEnabled;
      if (key === "enableHelmetSkillPenalties") return helmetSkillPenaltiesEnabled;
      if (key === "enableArmorAutomation") return true;
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
          enabled: true,
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

function chainBaselineActor(extraItems = []) {
  const items = [
    nativeArmor("chainmail", "Chainmail", true),
    nativeArmor("studded", "Studded Leather Armor", false),
    ...extraItems
  ];
  items.get = (id) => items.find((item) => item.id === id) ?? null;
  return {
    id: "chain-profile-target",
    uuid: "Actor.chain-profile-target",
    flags: {
      [MODULE_ID]: {
        armorProfile: {
          baselineItemId: "chainmail",
          slots: { legs: "studded" }
        }
      }
    },
    items,
    getFlag: itemGetFlag
  };
}

function unarmoredActor(extraItems = []) {
  const items = [...extraItems];
  items.get = (id) => items.find((item) => item.id === id) ?? null;
  return {
    id: "unarmored-target",
    uuid: "Actor.unarmored-target",
    flags: {},
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
const fullPlateHelmet = helmet("full-plate-helm", { armorFamily: "full-plate" });
assert.equal(calculateHelmetLocalArmor(fullPlateHelmet).localArmorBonus, 8);
const customHelmet = helmet("custom-helm", { localArmorBonus: 3 });
assert.equal(calculateHelmetLocalArmor(customHelmet).localArmorBonus, 3);

const actorWithHelmet = profileActor([plateHelmet]);
let resolved = resolveArmorProfile(actorWithHelmet);
assert.equal(resolved.summary.armorBonus, 2);
assert.equal(resolved.summary.maxDex, 2);
assert.equal(resolved.summary.activePieces.some((piece) => piece.id === "plate-helm"), false);

helmetCoverageEnabled = false;
const legacyHead = calculateLocalArmorAdjustment(actorWithHelmet, "head");
assert.equal(legacyHead.aggregateTotal, 2);
assert.equal(legacyHead.localTotal, 1);
assert.equal(legacyHead.adjustment, -1);

helmetCoverageEnabled = true;
const noHelmetHead = calculateLocalArmorAdjustment(profileActor(), "head");
assert.equal(noHelmetHead.aggregateTotal, 2);
assert.equal(noHelmetHead.localTotal, 0);
assert.equal(noHelmetHead.adjustment, -2);
assert.equal(noHelmetHead.pieceCount, 0);

const helmetHead = calculateLocalArmorAdjustment(actorWithHelmet, "head");
assert.equal(helmetHead.source, "helmet");
assert.equal(helmetHead.localTotal, 8);
assert.equal(helmetHead.inheritedLocalTotal, 1);
assert.equal(helmetHead.helmetCap, 8);
assert.equal(helmetHead.helmetArmorBonus, 8);
assert.equal(helmetHead.adjustment, 6);
assert.equal(helmetHead.pieceCount, 1);
assert.equal(resolveArmorProfile(actorWithHelmet).summary.armorBonus, 2);
assert.equal(calculateLocalArmorAdjustment(actorWithHelmet, "ear").localTotal, 8);
assert.equal(calculateLocalArmorAdjustment(actorWithHelmet, "eye").localTotal, 8);
assert.equal(calculateLocalArmorAdjustment(actorWithHelmet, "torso").adjustment, -1);

const ignoredHelmet = calculateLocalArmorAdjustment(profileActor([helmet("belt-helm", { slot: "belt" })]), "head");
assert.equal(ignoredHelmet.localTotal, 0);
assert.equal(ignoredHelmet.adjustment, -2);

const customActor = profileActor([customHelmet]);
assert.equal(calculateLocalArmorAdjustment(customActor, "head").localTotal, 3);
assert.equal(calculateLocalArmorAdjustment(customActor, "head").helmetCap, 3);
assert.equal(calculateLocalArmorAdjustment(customActor, "head").adjustment, 1);

const unarmoredPlateHelmet = calculateLocalArmorAdjustment(unarmoredActor([plateHelmet]), "head");
assert.equal(unarmoredPlateHelmet.aggregateTotal, 0);
assert.equal(unarmoredPlateHelmet.inheritedLocalTotal, 0);
assert.equal(unarmoredPlateHelmet.localTotal, 8);
assert.equal(unarmoredPlateHelmet.adjustment, 8);

const liveCaseNoHelmet = calculateLocalArmorAdjustment(chainBaselineActor(), "head");
assert.equal(liveCaseNoHelmet.aggregateTotal, 6);
assert.equal(liveCaseNoHelmet.localTotal, 0);
assert.equal(liveCaseNoHelmet.adjustment, -6);
assert.equal(liveCaseNoHelmet.inheritedLocalTotal, 3);
const noHelmetAc = { ac: 19, acModifiers: [] };
applyLocalArmorAdjustment(chainBaselineActor(), noHelmetAc, { locationLabel: "Head", coverageSlot: "head" });
assert.equal(noHelmetAc.ac, 13);
assert.equal(noHelmetAc.acModifiers.at(-1).sourceName, "Called Shot Location Armor: Head (profile 6 -> no helmet 0)");

const chainHelmetActor = chainBaselineActor([helmet("chain-helm", { name: "Chain Coif", armorFamily: "chain" })]);
const liveCaseChainHelmet = calculateLocalArmorAdjustment(chainHelmetActor, "head");
assert.equal(liveCaseChainHelmet.aggregateTotal, 6);
assert.equal(liveCaseChainHelmet.inheritedLocalTotal, 3);
assert.equal(liveCaseChainHelmet.helmetCap, 5);
assert.equal(liveCaseChainHelmet.localTotal, 5);
assert.equal(liveCaseChainHelmet.adjustment, -1);
const chainHelmetAc = { ac: 19, acModifiers: [] };
applyLocalArmorAdjustment(chainHelmetActor, chainHelmetAc, { locationLabel: "Head", coverageSlot: "head" });
assert.equal(chainHelmetAc.ac, 18);
assert.equal(chainHelmetAc.acModifiers.at(-1).sourceName, "Called Shot Location Armor: Head (profile 6 -> helmet 5)");

const plateCapActor = chainBaselineActor([plateHelmet]);
const liveCasePlateHelmet = calculateLocalArmorAdjustment(plateCapActor, "head");
assert.equal(liveCasePlateHelmet.inheritedLocalTotal, 3);
assert.equal(liveCasePlateHelmet.helmetCap, 8);
assert.equal(liveCasePlateHelmet.localTotal, 8);
assert.equal(liveCasePlateHelmet.adjustment, 2);

const leatherCapActor = chainBaselineActor([helmet("leather-cap", { armorFamily: "leather" })]);
const liveCaseLeatherHelmet = calculateLocalArmorAdjustment(leatherCapActor, "head");
assert.equal(liveCaseLeatherHelmet.inheritedLocalTotal, 3);
assert.equal(liveCaseLeatherHelmet.helmetCap, 2);
assert.equal(liveCaseLeatherHelmet.localTotal, 2);
assert.equal(liveCaseLeatherHelmet.adjustment, -4);

const disabledHelmet = helmet("disabled-helm");
disabledHelmet.flags[MODULE_ID].helmet.enabled = false;
const disabledActor = profileActor([disabledHelmet]);
assert.equal(calculateLocalArmorAdjustment(disabledActor, "head").localTotal, 0);

const weakerHelmet = helmet("weaker-helm", { name: "Leather Cap", armorFamily: "leather" });
const strongerHelmet = helmet("stronger-helm", { name: "Great Helm", customLocalArmorBonus: 8, localArmorBonus: 8 });
let warningText = "";
const originalWarn = console.warn;
console.warn = (message) => {
  warningText = String(message);
};
const multiHelmet = calculateLocalArmorAdjustment(chainBaselineActor([weakerHelmet, strongerHelmet]), "head");
console.warn = originalWarn;
assert.equal(multiHelmet.localTotal, 8);
assert.equal(multiHelmet.helmetCap, 8);
assert.equal(multiHelmet.inheritedLocalTotal, 3);
assert.equal(multiHelmet.adjustment, 2);
assert.equal(multiHelmet.pieces[0].name, "Great Helm");
assert.match(warningText, /Multiple configured helmets/);

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
assert.equal(applyHelmetSkillPenaltyToHookData(actorWithHelmet, "jmp", hookData), null);
assert.deepEqual(hookData.skillSourceDetails, []);

const mildPenaltyHelmet = helmet("mild-penalty", { name: "Mild Helm", spotPenalty: 1, listenPenalty: 1 });
const severePenaltyHelmet = helmet("severe-penalty", { name: "Severe Helm", spotPenalty: 5, listenPenalty: 3 });
warningText = "";
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
