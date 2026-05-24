import assert from "node:assert/strict";
import { LOCAL_ARMOR_MODES } from "../scripts/constants.js";
import {
  applyLocalArmorAdjustment,
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
      return true;
    }
  }
};

function piece(id, slot, armorBonus, enhancementBonus = 0) {
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
          enhancementBonus
        }
      }
    }
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
    }
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
    piece("legs", "legs", 3, 1),
    piece("head", "head", 6, 1),
    piece("arms", "arms", 1, 0)
  ],
  getActiveTokens() {
    return [{ document: { uuid: "Scene.scene.Token.target-token" } }];
  }
};

assert.equal(normalizeArmorSlot("Leg"), "legs");
assert.equal(normalizeArmorSlot("Feet"), "legs");
assert.equal(normalizeArmorSlot("Eye"), "head");
assert.equal(normalizeArmorSlot("Vitals"), "torso");

const legs = calculateLocalArmorAdjustment(actor, "legs");
assert.equal(legs.aggregateTotal, 5);
assert.equal(legs.localTotal, 4);
assert.equal(legs.adjustment, -1);

const head = calculateLocalArmorAdjustment(actor, "head");
assert.equal(head.adjustment, 2);
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
assert.equal(finalAc.acModifiers.at(-1).sourceName, "Called Shot Local Armor: Leg");
assert.equal(finalAc.acModifiers.at(-1).value, "-1");

const displayAc = { ac: 21, acModifiers: [] };
const displayed = applyLocalArmorAdjustment(actor, displayAc, payload, { mode: LOCAL_ARMOR_MODES.display });
assert.equal(displayed.adjusted, false);
assert.equal(displayAc.ac, 21);
assert.match(displayAc.acModifiers.at(-1).sourceName, /advisory/);

const touchAc = { ac: 12, acModifiers: [{ sourceName: "AC", value: 12 }] };
assert.equal(applyLocalArmorAdjustment(actor, touchAc, payload), null);
assert.equal(touchAc.ac, 12);

clearStagedCalledShotDamageApplication("gm-1");
stageCalledShotDamageApplication(payload, { userId: "gm-1", messageId: "msg-1" });
assert.equal(getStagedCalledShotDamageApplication("gm-1").messageId, "msg-1");
const stagedAc = { ac: 21, acModifiers: [] };
const staged = applyStagedCalledShotLocalArmor(actor, stagedAc, "gm-1");
assert.equal(staged.adjustment, -1);
assert.equal(stagedAc.ac, 20);
assert.equal(getStagedCalledShotDamageApplication("gm-1"), null);

console.log("test-local-armor: ok");
