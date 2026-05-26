import assert from "node:assert/strict";
import { LOCAL_ARMOR_MODES } from "../scripts/constants.js";
import { armorCoverageOverlaps, parseArmorCoverageSlots } from "../scripts/armor.js";
import {
  applyLocalArmorAdjustment,
  applyCalledShotConcealmentAdjustment,
  applyStagedCalledShotLocalArmor,
  attachCalledShotToDamageCard,
  calculateLocalArmorAdjustment,
  clearStagedCalledShotDamageApplication,
  extractCalledShotDamagePayloads,
  getStagedCalledShotDamageApplication,
  normalizeArmorSlot,
  sanitizeCalledShotDamagePayload,
  stageCalledShotDamageApplication
} from "../scripts/local-armor.js";

const MODULE_ID = "d35e-piecemeal-armor-called-shots";

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
      return true;
    }
  }
};

function itemGetFlag(moduleId, key) {
  return this.flags?.[moduleId]?.[key];
}

function piece(id, slot, armorBonus, enhancementBonus = 0, options = {}) {
  const magic = options.suit
    ? {
        magicMode: "suit",
        suitId: "playtest-suit"
      }
    : enhancementBonus > 0
      ? { magicMode: "separatePiece" }
      : {};
  return {
    id,
    name: `${slot} piece`,
    type: "equipment",
    system: {
      carried: true,
      melded: false,
      armor: { value: 0, enh: 0 }
    },
    flags: {
      [MODULE_ID]: {
        piecemeal: {
          enabled: true,
          slot,
          armorBonus,
          enhancementBonus,
          ...magic
        }
      }
    },
    getFlag: itemGetFlag
  };
}

function aggregate(armorBonus, enhancementBonus = 0, equipped = true) {
  return {
    id: "aggregate",
    name: "Piecemeal Armor Aggregate",
    type: "equipment",
    system: {
      equipped,
      armor: { value: armorBonus, enh: enhancementBonus }
    },
    flags: {
      [MODULE_ID]: {
        aggregate: {
          isAggregate: true,
          summary: { armorBonus, enhancementBonus }
        }
      }
    },
    getFlag: itemGetFlag
  };
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
      armor: { value: 0, enh: 0 },
      melded: false
    },
    flags: {},
    getFlag: itemGetFlag
  };
}

const actor = {
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
  items: [
    aggregate(4, 1),
    piece("legs", "legs", 3, 1, { suit: true }),
    piece("head", "head", 6, 1, { suit: true }),
    piece("arms", "arms", 1, 0, { suit: true })
  ],
  getActiveTokens() {
    return [{ document: { uuid: "Scene.scene.Token.target-token" } }];
  }
};

assert.equal(normalizeArmorSlot("Leg"), "legs");
assert.equal(normalizeArmorSlot("Feet"), "legs");
assert.equal(normalizeArmorSlot("Eye"), "head");
assert.equal(normalizeArmorSlot("Vitals"), "torso");
assert.deepEqual(parseArmorCoverageSlots("head; eyes, ears|face/neck"), ["head", "neck"]);
assert.equal(armorCoverageOverlaps("head; eyes; ears", "ear"), true);
assert.equal(armorCoverageOverlaps("legs", "head"), false);

const legs = calculateLocalArmorAdjustment(actor, "legs");
assert.equal(legs.aggregateTotal, 5);
assert.equal(legs.localTotal, 4);
assert.equal(legs.adjustment, -1);

const head = calculateLocalArmorAdjustment(actor, "head");
assert.equal(head.adjustment, 2);
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
const profileLegs = calculateLocalArmorAdjustment(profileActor, "legs");
assert.equal(profileLegs.aggregateTotal, 2);
assert.equal(profileLegs.localTotal, 0);
assert.equal(profileLegs.adjustment, -2);
const profileHead = calculateLocalArmorAdjustment(profileActor, "head");
assert.equal(profileHead.aggregateTotal, 2);
assert.equal(profileHead.localTotal, 1);
assert.equal(profileHead.adjustment, -1);
const multiCoverage = calculateLocalArmorAdjustment({
  ...actor,
  items: [
    aggregate(5, 0),
    piece("great-helm", "head; eyes; ears", 6, 1)
  ]
}, "ear");
assert.equal(multiCoverage.localTotal, 7);
assert.equal(multiCoverage.pieceCount, 1);
assert.equal(multiCoverage.adjustment, 2);
const dedupedCoverage = calculateLocalArmorAdjustment({
  ...actor,
  items: [
    aggregate(5, 0),
    piece("overlapping-helm", "head; eye", 6, 1)
  ]
}, "head; eye");
assert.equal(dedupedCoverage.localTotal, 7);
assert.equal(dedupedCoverage.pieceCount, 1);
assert.equal(calculateLocalArmorAdjustment({ ...actor, items: actor.items.slice(1) }, "legs"), null);
assert.equal(calculateLocalArmorAdjustment(actor, "hands"), null);
assert.equal(calculateLocalArmorAdjustment({ ...actor, items: [aggregate(5, 0, false), piece("legs", "legs", 4, 0)] }, "legs"), null);

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

const finalAc = { ac: 21, acModifiers: [{ sourceName: "AC", value: 21 }] };
const applied = applyLocalArmorAdjustment(actor, finalAc, payload);
assert.equal(applied.adjusted, true);
assert.equal(finalAc.ac, 20);
assert.equal(finalAc.acModifiers.at(-1).sourceName, "Called Shot Location Armor: Leg");
assert.equal(finalAc.acModifiers.at(-1).value, "-1");

const displayAc = { ac: 21, acModifiers: [] };
const displayed = applyLocalArmorAdjustment(actor, displayAc, payload, { mode: LOCAL_ARMOR_MODES.display });
assert.equal(displayed.adjusted, false);
assert.equal(displayAc.ac, 21);
assert.match(displayAc.acModifiers.at(-1).sourceName, /advisory/);

const coverAc = { ac: 25, acModifiers: [{ sourceName: "Cover", value: "+4" }] };
applyLocalArmorAdjustment(actor, coverAc, payload, { mode: LOCAL_ARMOR_MODES.display });
assert.equal(coverAc.ac, 29);
assert.equal(coverAc.acModifiers.some((entry) => entry.sourceName === "Called Shot Cover"), true);

const touchAc = { ac: 12, acModifiers: [{ sourceName: "AC", value: 12 }] };
const touchCalledShot = applyLocalArmorAdjustment(actor, touchAc, payload);
assert.equal(touchCalledShot.touchAdjustment.adjustment, 9);
assert.equal(touchCalledShot.adjustment, -1);
assert.equal(touchAc.ac, 20);

clearStagedCalledShotDamageApplication("gm-1");
stageCalledShotDamageApplication(payload, { userId: "gm-1", messageId: "msg-1" });
assert.equal(getStagedCalledShotDamageApplication("gm-1").messageId, "msg-1");
assert.equal(getStagedCalledShotDamageApplication("gm-1", Date.now() + 2 * 60 * 1000).messageId, "msg-1");
assert.equal(getStagedCalledShotDamageApplication("gm-1", Date.now() + 6 * 60 * 1000), null);
stageCalledShotDamageApplication(payload, { userId: "gm-1", messageId: "msg-2" });
const conceal = { concealTarget: 20 };
assert.deepEqual(applyCalledShotConcealmentAdjustment(actor, conceal, "gm-1"), { original: 20, adjusted: 50 });
assert.equal(conceal.concealTarget, 50);
const stagedAc = { ac: 21, acModifiers: [] };
const staged = applyStagedCalledShotLocalArmor(actor, stagedAc, "gm-1");
assert.equal(staged.adjustment, -1);
assert.equal(stagedAc.ac, 20);
assert.equal(getStagedCalledShotDamageApplication("gm-1").localArmor.adjustment, -1);

console.log("test-local-armor: ok");
