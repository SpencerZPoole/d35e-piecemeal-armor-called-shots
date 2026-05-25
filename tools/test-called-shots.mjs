import assert from "node:assert/strict";
import {
  buildAttackExtraPart,
  calculateCalledShotSituationalPenalty,
  clearCalledShot,
  consumeCalledShot,
  determineCalledShotSeverity,
  getCalledShotFeatState,
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
    targets: new Set([targetToken])
  }
};
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

console.log("test-called-shots: ok");
