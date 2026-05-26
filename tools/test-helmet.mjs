import assert from "node:assert/strict";
import { MODULE_ID } from "../scripts/constants.js";
import { resolveArmorProfile } from "../scripts/armor-profile.js";
import { applyHelmetSkillPenaltyToHookData, calculateHelmetLocalArmor } from "../scripts/helmet.js";
import { calculateLocalArmorAdjustment } from "../scripts/local-armor.js";

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

const plateHelmet = helmet("plate-helm");
assert.equal(calculateHelmetLocalArmor(plateHelmet).localArmorBonus, 6);
const customHelmet = helmet("custom-helm", { localArmorBonus: 3 });
assert.equal(calculateHelmetLocalArmor(customHelmet).localArmorBonus, 3);

const actorWithHelmet = profileActor([plateHelmet]);
let resolved = resolveArmorProfile(actorWithHelmet);
assert.equal(resolved.summary.armorBonus, 2);
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
assert.equal(helmetHead.localTotal, 6);
assert.equal(helmetHead.adjustment, 4);
assert.equal(helmetHead.pieceCount, 1);
assert.equal(calculateLocalArmorAdjustment(actorWithHelmet, "ear").localTotal, 6);
assert.equal(calculateLocalArmorAdjustment(actorWithHelmet, "eye").localTotal, 6);
assert.equal(calculateLocalArmorAdjustment(actorWithHelmet, "torso").adjustment, -1);

const ignoredHelmet = calculateLocalArmorAdjustment(profileActor([helmet("belt-helm", { slot: "belt" })]), "head");
assert.equal(ignoredHelmet.localTotal, 0);
assert.equal(ignoredHelmet.adjustment, -2);

const customActor = profileActor([customHelmet]);
assert.equal(calculateLocalArmorAdjustment(customActor, "head").localTotal, 3);
assert.equal(calculateLocalArmorAdjustment(customActor, "head").adjustment, 1);

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

console.log("test-helmet: ok");
