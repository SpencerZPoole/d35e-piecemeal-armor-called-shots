import assert from "node:assert/strict";
import { FULL_ATTACK_FEAT_RULE_MODES, FULL_ATTACK_MODES, OUTCOME_MODES, RULES_MODES, SETTINGS } from "../scripts/constants.js";
import {
  applyAutomaticCalledShotOutcome,
  buildAttackExtraPart,
  calledShotOutcomeNeedsConfirmation,
  calculateCalledShotSituationalPenalty,
  clearCalledShot,
  consumeCalledShot,
  determineCalledShotSeverity,
  getCalledShotFullAttackFeatRuleMode,
  getCalledShotFeatState,
  getCalledShotOutcomeMode,
  getPendingCalledShot,
  noteCalledShotAttackSequence,
  stageCalledShot,
  stageCalledShotForEveryAttack,
  stageCalledShotQueue
} from "../scripts/called-shots.js";
import { canApplyCalledShotLocalArmor, resolveFullAttackFeatRuleDecision } from "../scripts/d35e-integration.js";
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

function setPath(target, path, value) {
  const parts = path.split(".");
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    cursor[part] ??= {};
    cursor = cursor[part];
  }
  cursor[parts.at(-1)] = value;
}

function outcomeActor(id = "target") {
  return {
    id,
    uuid: `Actor.${id}`,
    system: {
      abilities: {
        con: { damage: 0 },
        dex: { damage: 0 },
        str: { damage: 0 },
        int: { damage: 0 },
        wis: { damage: 0 },
        cha: { damage: 0 }
      },
      attributes: {
        hp: { max: 30, value: 30 },
        conditions: { dead: false, sickened: false, fatigued: false },
        savingThrows: {
          fort: { total: 5 },
          ref: { total: 5 },
          will: { total: 5 }
        }
      }
    },
    flags: { "d35e-piecemeal-armor-called-shots": {} },
    effects: [],
    async update(update) {
      for (const [path, value] of Object.entries(update)) setPath(this, path, value);
    },
    async setFlag(moduleId, key, value) {
      this.flags[moduleId] ??= {};
      this.flags[moduleId][key] = value;
    },
    getFlag(moduleId, key) {
      return this.flags[moduleId]?.[key];
    },
    async createEmbeddedDocuments(_type, documents) {
      const created = documents.map((document, index) => ({
        ...document,
        id: `effect-${this.effects.length + index + 1}`
      }));
      this.effects.push(...created);
      return created;
    },
    conditions: {
      async toggleConditionStatusIcons() {}
    }
  };
}

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

const noFeatRepeatQueue = stageCalledShotQueue(actor, item, ["ear", "eye"], { profiles, userId: "user-repeat", repeatPenaltyAfterFirst: true });
assert.equal(noFeatRepeatQueue[0].penalty, -10);
assert.equal(noFeatRepeatQueue[1].repeatPenalty, -5);
assert.equal(noFeatRepeatQueue[1].penalty, -15);
const noFeatEvery = stageCalledShotForEveryAttack(actor, item, "ear", { profiles, userId: "user-every-repeat", repeatPenaltyAfterFirst: true });
assert.equal(noFeatEvery.repeatPenaltyAfterFirst, true);
assert.equal(consumeCalledShot(actor, item, "user-every-repeat").penalty, -10);
assert.equal(consumeCalledShot(actor, item, "user-every-repeat").penalty, -15);
clearCalledShot(actor, item, "user-every-repeat");

assert.deepEqual(resolveFullAttackFeatRuleDecision({
  rulesMode: RULES_MODES.rawAdapted,
  featRuleMode: FULL_ATTACK_FEAT_RULE_MODES.require,
  feats: {},
  mode: FULL_ATTACK_MODES.all,
  calledShotCount: 2
}), {
  allow: false,
  repeatPenaltyAfterFirst: true,
  warnings: ["RAW-adapted called shots cannot be combined with D35E Full Attack unless the attacker has Improved Called Shot."],
  info: null,
  forceFirst: false
});
assert.deepEqual(resolveFullAttackFeatRuleDecision({
  rulesMode: RULES_MODES.rawAdapted,
  featRuleMode: FULL_ATTACK_FEAT_RULE_MODES.require,
  feats: {},
  mode: FULL_ATTACK_MODES.first,
  calledShotCount: 1
}), {
  allow: false,
  repeatPenaltyAfterFirst: false,
  warnings: ["RAW-adapted called shots cannot be combined with D35E Full Attack unless the attacker has Improved Called Shot."],
  info: null,
  forceFirst: false
});
assert.deepEqual(resolveFullAttackFeatRuleDecision({
  rulesMode: RULES_MODES.rawAdapted,
  featRuleMode: FULL_ATTACK_FEAT_RULE_MODES.require,
  feats: {},
  mode: FULL_ATTACK_MODES.disabled,
  calledShotCount: 1
}), {
  allow: false,
  repeatPenaltyAfterFirst: false,
  warnings: [],
  info: null,
  forceFirst: false
});
assert.equal(resolveFullAttackFeatRuleDecision({
  rulesMode: RULES_MODES.rawAdapted,
  featRuleMode: FULL_ATTACK_FEAT_RULE_MODES.require,
  feats: { improved: true, greater: false },
  mode: FULL_ATTACK_MODES.all,
  calledShotCount: 2
}).forceFirst, true);
assert.equal(resolveFullAttackFeatRuleDecision({
  rulesMode: RULES_MODES.rawAdapted,
  featRuleMode: FULL_ATTACK_FEAT_RULE_MODES.require,
  feats: { improved: true, greater: true },
  mode: FULL_ATTACK_MODES.all,
  calledShotCount: 2
}).repeatPenaltyAfterFirst, true);
assert.deepEqual(resolveFullAttackFeatRuleDecision({
  rulesMode: RULES_MODES.rawAdapted,
  featRuleMode: FULL_ATTACK_FEAT_RULE_MODES.warnOnly,
  feats: {},
  mode: FULL_ATTACK_MODES.all,
  calledShotCount: 2
}).warnings, [
  "This full-attack called shot would normally require Improved Called Shot.",
  "Multiple called shots in one full attack would normally require Greater Called Shot."
]);
assert.equal(resolveFullAttackFeatRuleDecision({
  rulesMode: RULES_MODES.rawAdapted,
  featRuleMode: FULL_ATTACK_FEAT_RULE_MODES.ignore,
  feats: {},
  mode: FULL_ATTACK_MODES.all,
  calledShotCount: 2
}).warnings.length, 0);

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
      if (key === SETTINGS.calledShotFullAttackFeatRules) return currentFeatRuleMode;
      if (key === SETTINGS.enableArmor) return armorEnabled;
      if (key === SETTINGS.enableCalledShots) return calledShotsEnabled;
      return true;
    }
  }
};
let currentOutcomeMode = OUTCOME_MODES.confirmSevere;
let currentFeatRuleMode = FULL_ATTACK_FEAT_RULE_MODES.require;
let armorEnabled = true;
let calledShotsEnabled = true;
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
const closeTarget = {
  document: { uuid: "Scene.test.Token.close" },
  x: 400,
  y: 0,
  w: 1,
  h: 1
};
game.user.targets = new Set([closeTarget]);
const closeRangePenalty = calculateCalledShotSituationalPenalty(rangedActor, bow, "Scene.test.Token.close");
assert.equal(closeRangePenalty.distance, 20);
assert.equal(closeRangePenalty.penalty, 0);
const reachTarget = {
  document: { uuid: "Scene.test.Token.reach" },
  x: 200,
  y: 0,
  w: 1,
  h: 1
};
game.user.targets = new Set([reachTarget]);
const meleeReachPenalty = calculateCalledShotSituationalPenalty(rangedActor, { system: { actionType: "mwak" } }, "Scene.test.Token.reach");
assert.equal(meleeReachPenalty.distance, 10);
assert.equal(meleeReachPenalty.penalty, -2);
game.user.targets = new Set([targetToken]);

assert.equal(determineCalledShotSeverity({ damage: 10, crit: false }), "normal");
assert.equal(determineCalledShotSeverity({ damage: 10, crit: true }), "critical");
assert.equal(determineCalledShotSeverity({ damage: 40, crit: false, debilitatingMinimum: 40, targetActor: { system: { attributes: { hp: { max: 70 } } } } }), "debilitating");
assert.equal(determineCalledShotSeverity({ damage: 39, crit: true, debilitatingMinimum: 40, targetActor: { system: { attributes: { hp: { max: 70 } } } } }), "critical");
assert.equal(getCalledShotOutcomeMode(), OUTCOME_MODES.confirmSevere);
assert.equal(getCalledShotFullAttackFeatRuleMode(), FULL_ATTACK_FEAT_RULE_MODES.require);
currentFeatRuleMode = FULL_ATTACK_FEAT_RULE_MODES.ignore;
assert.equal(getCalledShotFullAttackFeatRuleMode(), FULL_ATTACK_FEAT_RULE_MODES.ignore);
assert.equal(calledShotOutcomeNeedsConfirmation("normal"), false);
assert.equal(calledShotOutcomeNeedsConfirmation("critical"), true);
assert.equal(calledShotOutcomeNeedsConfirmation("debilitating"), true);
assert.equal(canApplyCalledShotLocalArmor(), true);
armorEnabled = false;
assert.equal(canApplyCalledShotLocalArmor(), false);
armorEnabled = true;
calledShotsEnabled = false;
assert.equal(canApplyCalledShotLocalArmor(), false);
calledShotsEnabled = true;

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

globalThis.game.user.isGM = true;
currentOutcomeMode = OUTCOME_MODES.automatic;
assert.equal(await applyAutomaticCalledShotOutcome({
  targetActor: outcomeActor("target-miss"),
  context: {
    hit: false,
    finalDamage: { damage: 20 },
    payload: { locationId: "head", profileId: profile.id, debilitatingMinimum: 50 }
  }
}), null);
assert.equal(await applyAutomaticCalledShotOutcome({
  targetActor: outcomeActor("target-zero-damage"),
  context: {
    hit: true,
    finalDamage: { damage: 0 },
    payload: { locationId: "head", profileId: profile.id, debilitatingMinimum: 50 }
  }
}), null);
assert.equal(await applyAutomaticCalledShotOutcome({
  targetActor: outcomeActor("target-automatic-hit"),
  context: {
    hit: true,
    automaticHit: true,
    finalDamage: { damage: 20 },
    payload: { locationId: "head", profileId: profile.id, debilitatingMinimum: 50 }
  }
}), null);
const automaticTarget = outcomeActor("target-automatic");
const automaticOutcome = await applyAutomaticCalledShotOutcome({
  targetActor: automaticTarget,
  context: {
    hit: true,
    crit: false,
    roll: 22,
    finalDamage: { damage: 8 },
    payload: { locationId: "head", profileId: profile.id, debilitatingMinimum: 50 }
  }
});
assert.equal(automaticOutcome.ledgerEntry.severity, "normal");
assert.equal(automaticOutcome.ledgerEntry.saveDc, 22);
assert.equal(automaticTarget.system.attributes.conditions.sickened, true);
assert.equal(automaticTarget.getFlag("d35e-piecemeal-armor-called-shots", "calledShotLedger").length, 1);

console.log("test-called-shots: ok");
