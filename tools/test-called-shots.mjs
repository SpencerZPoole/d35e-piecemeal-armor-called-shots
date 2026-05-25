import assert from "node:assert/strict";
import { OUTCOME_MODES } from "../scripts/constants.js";
import {
  applyAutomaticCalledShotOutcome,
  buildAttackExtraPart,
  calledShotOutcomeNeedsConfirmation,
  calculateCalledShotSituationalPenalty,
  clearCalledShot,
  consumeCalledShot,
  determineCalledShotSeverity,
  getCalledShotFeatState,
  getCalledShotOutcomeMode,
  getPendingCalledShot,
  noteCalledShotAttackSequence,
  stageCalledShot,
  stageCalledShotForEveryAttack,
  stageCalledShotQueue
} from "../scripts/called-shots.js";
import {
  getActiveProfile,
  getDefaultCalledShotProfiles,
  getLocation,
  normalizeCalledShotProfiles,
  validateEffectSpec
} from "../scripts/profiles.js";

const profiles = normalizeCalledShotProfiles(getDefaultCalledShotProfiles());
const profile = getActiveProfile(profiles);
const arm = getLocation(profile, "arm");
assert.equal(arm.penalty, -2);
assert.equal(arm.coverageSlot, "arms");
assert.equal(arm.outcomes.critical.some((effect) => effect.type === "abilityDamage"), true);
assert.equal(getLocation(profile, "heart").penalty, -10);
assert.equal(getLocation(profile, "heart").difficulty, "challenging");

validateEffectSpec({ type: "condition", status: "stunned" });
validateEffectSpec({ type: "abilityDamage", ability: "str", formula: "1d4" });

const actor = { id: "actor-1" };
const item = { id: "item-1", actor };
const payload = stageCalledShot(actor, item, "eye", { profiles, userId: "user-1", targetUuid: "Actor.target" });
assert.equal(payload.locationLabel, "Eye");
assert.equal(payload.penalty, -10);
assert.equal(getPendingCalledShot(actor, item, "user-1").locationId, "eye");

const extra = buildAttackExtraPart(payload);
assert.deepEqual(extra, { part: "-10", source: "Called Shot: Eye", value: -10 });

const consumed = consumeCalledShot(actor, item, "user-1");
assert.equal(consumed.locationId, "eye");
assert.equal(getPendingCalledShot(actor, item, "user-1"), null);
assert.equal(clearCalledShot(actor, item, "user-1"), false);

const queued = stageCalledShotQueue(actor, item, ["", "ear", "eye"], { profiles, userId: "user-1" });
assert.equal(queued.length, 3);
assert.equal(queued[0], null);
assert.equal(queued[1].locationId, "ear");
assert.equal(getPendingCalledShot(actor, item, "user-1").locationId, "ear");
assert.equal(consumeCalledShot(actor, item, "user-1"), null);
assert.equal(consumeCalledShot(actor, item, "user-1").locationId, "ear");
assert.equal(consumeCalledShot(actor, item, "user-1").locationId, "eye");
assert.equal(getPendingCalledShot(actor, item, "user-1"), null);

stageCalledShotQueue(actor, item, ["ear"], { profiles, userId: "user-1" });
const labels = noteCalledShotAttackSequence(actor, item, [{ label: "Bite" }, { label: "Claw" }], "user-1");
assert.deepEqual(labels, ["Bite", "Claw"]);
assert.equal(consumeCalledShot(actor, item, "user-1").attackLabel, "Bite");
assert.equal(consumeCalledShot(actor, item, "user-1"), null);

const every = stageCalledShotForEveryAttack(actor, item, "ear", { profiles, userId: "user-1" });
assert.equal(every.locationId, "ear");
assert.equal(consumeCalledShot(actor, item, "user-1").locationId, "ear");
assert.equal(consumeCalledShot(actor, item, "user-1").locationId, "ear");
assert.equal(clearCalledShot(actor, item, "user-1"), true);

const improvedActor = {
  id: "actor-improved",
  items: [{ type: "feat", name: "Improved Called Shot" }]
};
const greaterActor = {
  id: "actor-greater",
  items: [{ type: "feat", name: "Greater Called Shot" }]
};
assert.deepEqual(getCalledShotFeatState(improvedActor), { improved: true, greater: false });
assert.deepEqual(getCalledShotFeatState(greaterActor), { improved: true, greater: true });
const improvedPayload = stageCalledShot(improvedActor, { id: "item-improved", actor: improvedActor }, "ear", { profiles, userId: "user-2" });
assert.equal(improvedPayload.basePenalty, -10);
assert.equal(improvedPayload.featBonus, 2);
assert.equal(improvedPayload.penalty, -8);
const greaterQueue = stageCalledShotQueue(greaterActor, { id: "item-greater", actor: greaterActor }, ["ear", "eye"], { profiles, userId: "user-3" });
assert.equal(greaterQueue[0].penalty, -8);
assert.equal(greaterQueue[1].repeatPenalty, -5);
assert.equal(greaterQueue[1].penalty, -13);
assert.equal(greaterQueue[1].debilitatingMinimum, 40);

const targetToken = {
  document: { uuid: "Scene.test.Token.target" },
  x: 900,
  y: 0,
  w: 1,
  h: 1
};
globalThis.canvas = {
  grid: { size: 100 },
  scene: { grid: { distance: 5 } }
};
globalThis.game = {
  user: {
    isGM: true,
    targets: new Set([targetToken])
  },
  settings: {
    get(_moduleId, key) {
      if (key === "calledShotProfiles") return profiles;
      if (key === "calledShotOutcomeMode") return currentOutcomeMode;
      return true;
    }
  }
};
let currentOutcomeMode = OUTCOME_MODES.confirmSevere;
const rangedActor = {
  id: "ranged",
  getActiveTokens() {
    return [{ x: 0, y: 0, w: 1, h: 1 }];
  }
};
const bow = { system: { range: { value: 30 } } };
const rangePenalty = calculateCalledShotSituationalPenalty(rangedActor, bow, "Scene.test.Token.target");
assert.equal(rangePenalty.distance, 45);
assert.equal(rangePenalty.penalty, -4);

assert.equal(determineCalledShotSeverity({ damage: 10, crit: false }), "normal");
assert.equal(determineCalledShotSeverity({ damage: 10, crit: true }), "critical");
assert.equal(determineCalledShotSeverity({ damage: 40, crit: false, debilitatingMinimum: 40, targetActor: { system: { attributes: { hp: { max: 70 } } } } }), "debilitating");
assert.equal(getCalledShotOutcomeMode(), OUTCOME_MODES.confirmSevere);
assert.equal(calledShotOutcomeNeedsConfirmation("normal"), false);
assert.equal(calledShotOutcomeNeedsConfirmation("critical"), true);
assert.equal(calledShotOutcomeNeedsConfirmation("debilitating"), true);

currentOutcomeMode = OUTCOME_MODES.advisory;
const advisoryOutcome = await applyAutomaticCalledShotOutcome({
  targetActor: { id: "target-advisory", system: { attributes: { hp: { max: 30 } } } },
  context: {
    hit: true,
    crit: false,
    finalDamage: { damage: 5 },
    payload: { locationId: "ear", profileId: profile.id, debilitatingMinimum: 50 }
  }
});
assert.deepEqual(advisoryOutcome, { applied: false, skipped: true, reason: "advisory", severity: "normal" });

currentOutcomeMode = OUTCOME_MODES.confirmSevere;
let confirmationAsked = false;
const declinedOutcome = await applyAutomaticCalledShotOutcome({
  targetActor: { id: "target-declined", system: { attributes: { hp: { max: 30 } } } },
  context: {
    hit: true,
    crit: true,
    finalDamage: { damage: 5 },
    payload: { locationId: "ear", profileId: profile.id, debilitatingMinimum: 50 }
  },
  confirmOutcome: async () => {
    confirmationAsked = true;
    return false;
  }
});
assert.equal(confirmationAsked, true);
assert.deepEqual(declinedOutcome, { applied: false, skipped: true, reason: "declined", severity: "critical" });

globalThis.game.user.isGM = false;
const nonGmOutcome = await applyAutomaticCalledShotOutcome({
  targetActor: { id: "target-non-gm", system: { attributes: { hp: { max: 30 } } } },
  context: {
    hit: true,
    crit: true,
    finalDamage: { damage: 5 },
    payload: { locationId: "ear", profileId: profile.id, debilitatingMinimum: 50 }
  }
});
assert.deepEqual(nonGmOutcome, { applied: false, skipped: true, reason: "requiresGmConfirmation", severity: "critical" });

console.log("test-called-shots: ok");
