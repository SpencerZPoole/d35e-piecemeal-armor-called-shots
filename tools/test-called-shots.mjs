import assert from "node:assert/strict";
import {
  buildAttackExtraPart,
  clearCalledShot,
  consumeCalledShot,
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

console.log("test-called-shots: ok");
