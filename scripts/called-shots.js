import { FULL_ATTACK_FEAT_RULE_MODES, MODULE_ID, OUTCOME_MODES, RULES_MODES, SETTINGS } from "./constants.js";
import { getCurrentRulesMode } from "./armor.js";
import { applyOutcome } from "./effects.js";
import { getActiveProfile, getDefaultCalledShotProfiles, getEnabledLocations, getLocation, normalizeCalledShotProfiles } from "./profiles.js";

const pendingCalledShots = new Map();

function getUserId() {
  return globalThis.game?.user?.id ?? "node";
}

function pendingKey(actor, item, userId = getUserId()) {
  const actorId = actor?.id ?? item?.actor?.id ?? "no-actor";
  const itemId = item?.id ?? "no-item";
  return `${userId}:${actorId}:${itemId}`;
}

function getProperty(source, path) {
  if (!source || !path) return undefined;
  if (globalThis.foundry?.utils?.getProperty) return foundry.utils.getProperty(source, path);
  return path.split(".").reduce((current, key) => current?.[key], source);
}

function normalizeName(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character]);
}

function actorItems(actor) {
  if (actor?.items?.contents) return actor.items.contents;
  if (Array.isArray(actor?.items)) return actor.items;
  return [];
}

function hasFeat(actor, featName) {
  const wanted = normalizeName(featName);
  return actorItems(actor).some((item) => item?.type === "feat" && normalizeName(item.name) === wanted);
}

export function getCalledShotFeatState(actor) {
  const greater = hasFeat(actor, "Greater Called Shot");
  const improved = greater || hasFeat(actor, "Improved Called Shot");
  return { improved, greater };
}

export function getCalledShotFullAttackFeatRuleMode() {
  try {
    const configured = game.settings.get(MODULE_ID, SETTINGS.calledShotFullAttackFeatRules);
    return Object.values(FULL_ATTACK_FEAT_RULE_MODES).includes(configured)
      ? configured
      : FULL_ATTACK_FEAT_RULE_MODES.require;
  } catch (_error) {
    return FULL_ATTACK_FEAT_RULE_MODES.require;
  }
}

function tokenCenter(token) {
  if (token?.center) return token.center;
  const gridSize = globalThis.canvas?.grid?.size || 100;
  return {
    x: (token?.x ?? token?.object?.x ?? 0) + ((token?.w ?? token?.width ?? token?.object?.w ?? 1) * gridSize / 2),
    y: (token?.y ?? token?.object?.y ?? 0) + ((token?.h ?? token?.height ?? token?.object?.h ?? 1) * gridSize / 2)
  };
}

function actorToken(actor) {
  return actor?.getActiveTokens?.()[0] ?? actor?.token ?? null;
}

function targetForUuid(targetUuid) {
  for (const target of globalThis.game?.user?.targets ?? []) {
    const uuid = target?.document?.uuid ?? target?.actor?.uuid;
    if (!targetUuid || uuid === targetUuid) return target;
  }
  return null;
}

export function measureCalledShotDistance(actor, targetUuid) {
  const source = actorToken(actor);
  const target = targetForUuid(targetUuid);
  if (!source || !target || !globalThis.canvas) return null;
  const a = tokenCenter(source);
  const b = tokenCenter(target);
  const gridSize = canvas.grid?.size || 100;
  const gridDistance = canvas.scene?.grid?.distance || 5;
  return Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.y ?? 0) - (b.y ?? 0)) / gridSize * gridDistance;
}

function isRangedAttack(item) {
  const actionType = String(getProperty(item, "system.actionType") ?? "");
  if (["rwak", "rsak"].includes(actionType)) return true;
  if (getProperty(item, "system.thrown") === true) return true;
  const range = getProperty(item, "system.range.value") ?? getProperty(item, "system.weaponData.range");
  return range !== null && range !== undefined && range !== "" && Number(range) > 0;
}

export function calculateCalledShotSituationalPenalty(actor, item, targetUuid) {
  const distance = measureCalledShotDistance(actor, targetUuid);
  if (!Number.isFinite(distance)) return { penalty: 0, parts: [], distance: null };
  const parts = [];
  let penalty = 0;

  if (!isRangedAttack(item)) {
    if (distance > (canvas?.scene?.grid?.distance || 5)) {
      penalty -= 2;
      parts.push({ label: "Called Shot Range/Reach", value: -2 });
    }
    return { penalty, parts, distance };
  }

  if (distance > 30) {
    const rangeIncrement = Number(getProperty(item, "system.range.value") ?? getProperty(item, "system.weaponData.range"));
    let rangePenalty = -2;
    if (Number.isFinite(rangeIncrement) && rangeIncrement > 0) {
      const incrementsBeyondFirst = Math.max(0, Math.ceil(distance / rangeIncrement) - 1);
      rangePenalty = Math.min(-2, -4 * incrementsBeyondFirst || -2);
    }
    penalty += rangePenalty;
    parts.push({ label: "Called Shot Range", value: rangePenalty });
  }

  return { penalty, parts, distance };
}

function buildPayloadAdjustments(actor, item, options = {}) {
  const rulesMode = getCurrentRulesMode(options);
  const calledShotFeats = getCalledShotFeatState(actor);
  const featBonus = rulesMode === RULES_MODES.rawAdapted && calledShotFeats.improved ? 2 : 0;
  const repeatPenaltyAfterFirst = rulesMode === RULES_MODES.rawAdapted && (calledShotFeats.greater || options.repeatPenaltyAfterFirst === true);
  const repeatPenalty = repeatPenaltyAfterFirst && options.additionalCalledShot === true ? -5 : 0;
  const range = rulesMode === RULES_MODES.rawAdapted
    ? calculateCalledShotSituationalPenalty(actor, item, options.targetUuid)
    : { penalty: 0, parts: [], distance: null };

  return {
    rulesMode,
    calledShotFeats,
    featBonus,
    repeatPenalty,
    repeatPenaltyAfterFirst,
    rangePenalty: range.penalty,
    rangeParts: range.parts,
    distance: range.distance
  };
}

function buildCalledShotPayload(actor, item, locationId, options = {}) {
  const profiles = options.profiles ?? getCalledShotProfiles();
  const profile = options.profile ?? getActiveProfile(profiles);
  const location = getLocation(profile, locationId);
  if (!location) throw new Error(`Unknown called shot location: ${locationId}`);

  const basePenalty = Number(location.penalty) || 0;
  const adjustments = buildPayloadAdjustments(actor, item, options);
  const penalty = basePenalty + adjustments.featBonus + adjustments.repeatPenalty + adjustments.rangePenalty;

  return {
    userId: options.userId ?? getUserId(),
    actorId: actor?.id ?? item?.actor?.id ?? null,
    itemId: item?.id ?? null,
    targetUuid: options.targetUuid ?? null,
    profileId: profile.id,
    locationId: location.id,
    locationLabel: location.label,
    basePenalty,
    penalty,
    featBonus: adjustments.featBonus,
    repeatPenalty: adjustments.repeatPenalty,
    repeatPenaltyAfterFirst: adjustments.repeatPenaltyAfterFirst,
    rangePenalty: adjustments.rangePenalty,
    rangeParts: adjustments.rangeParts,
    distance: adjustments.distance,
    rulesMode: adjustments.rulesMode,
    calledShotFeats: adjustments.calledShotFeats,
    debilitatingMinimum: adjustments.calledShotFeats.greater ? 40 : 50,
    coverageSlot: location.coverageSlot ?? null,
    stagedAt: new Date().toISOString()
  };
}

function pendingPayload(entry) {
  if (!entry) return null;
  if (entry.mode === "queue") return entry.payloads.find(Boolean) ?? null;
  if (entry.mode === "all") return entry.payload ?? null;
  return entry;
}

export function getCalledShotProfiles() {
  if (!globalThis.game?.settings) return getDefaultCalledShotProfiles();
  const configured = game.settings.get(MODULE_ID, SETTINGS.calledShotProfiles);
  return normalizeCalledShotProfiles(configured);
}

export function getCalledShotOptions() {
  return getEnabledLocations(getActiveProfile(getCalledShotProfiles()));
}

export function stageCalledShot(actor, item, locationId, options = {}) {
  const payload = buildCalledShotPayload(actor, item, locationId, options);
  pendingCalledShots.set(pendingKey(actor, item, payload.userId), payload);
  return payload;
}

export function stageCalledShotQueue(actor, item, locationIds, options = {}) {
  const userId = options.userId ?? getUserId();
  let calledShotCount = 0;
  const payloads = (locationIds ?? []).map((locationId) => {
    if (!locationId || locationId === "none") return null;
    const additionalCalledShot = calledShotCount > 0;
    calledShotCount += 1;
    return buildCalledShotPayload(actor, item, locationId, { ...options, userId, additionalCalledShot });
  });
  if (!payloads.some(Boolean)) return [];
  pendingCalledShots.set(pendingKey(actor, item, userId), {
    mode: "queue",
    userId,
    payloads,
    rollScoped: options.rollScoped === true,
    attackLabels: []
  });
  return payloads;
}

export function stageCalledShotForEveryAttack(actor, item, locationId, options = {}) {
  const payload = buildCalledShotPayload(actor, item, locationId, options);
  pendingCalledShots.set(pendingKey(actor, item, payload.userId), {
    mode: "all",
    userId: payload.userId,
    payload,
    nextAttackIndex: 0,
    rollScoped: options.rollScoped === true,
    attackLabels: []
  });
  return payload;
}

export function consumeCalledShot(actor, item, userId = getUserId()) {
  const key = pendingKey(actor, item, userId);
  const entry = pendingCalledShots.get(key) ?? null;
  if (!entry) return null;
  if (entry.mode === "queue") {
    const payload = entry.payloads.shift() ?? null;
    if (entry.payloads.length === 0) pendingCalledShots.delete(key);
    return payload;
  }
  if (entry.mode === "all") {
    const repeatPenalty = entry.nextAttackIndex > 0 && entry.payload.repeatPenaltyAfterFirst ? -5 : 0;
    const payload = {
      ...entry.payload,
      repeatPenalty,
      penalty: entry.payload.basePenalty + entry.payload.featBonus + entry.payload.rangePenalty + repeatPenalty
    };
    if (entry.attackLabels?.[entry.nextAttackIndex]) payload.attackLabel = entry.attackLabels[entry.nextAttackIndex];
    entry.nextAttackIndex += 1;
    return payload;
  }
  const payload = entry;
  pendingCalledShots.delete(key);
  return payload;
}

export function clearCalledShot(actor, item, userId = getUserId()) {
  return pendingCalledShots.delete(pendingKey(actor, item, userId));
}

export function clearAllCalledShots() {
  const count = pendingCalledShots.size;
  pendingCalledShots.clear();
  return count;
}

export function getPendingCalledShot(actor, item, userId = getUserId()) {
  return pendingPayload(pendingCalledShots.get(pendingKey(actor, item, userId))) ?? null;
}

export function normalizeCalledShotOutcomeMode(value) {
  return Object.values(OUTCOME_MODES).includes(value) ? value : OUTCOME_MODES.confirmSevere;
}

export function getCalledShotOutcomeMode() {
  try {
    return normalizeCalledShotOutcomeMode(game.settings.get(MODULE_ID, SETTINGS.calledShotOutcomeMode));
  } catch (_error) {
    return OUTCOME_MODES.confirmSevere;
  }
}

export function calledShotOutcomeNeedsConfirmation(severity, mode = getCalledShotOutcomeMode()) {
  return mode === OUTCOME_MODES.confirmSevere && ["critical", "debilitating"].includes(severity);
}

export function noteCalledShotAttackSequence(actor, item, attacks, userId = getUserId()) {
  const key = pendingKey(actor, item, userId);
  const entry = pendingCalledShots.get(key);
  if (!entry || !entry.mode) return null;
  const labels = (attacks ?? []).map((attack, index) => attack?.label || `Attack ${index + 1}`);
  entry.attackLabels = labels;
  if (entry.mode === "queue") {
    while (entry.payloads.length < labels.length) entry.payloads.push(null);
    if (entry.payloads.length > labels.length) entry.payloads.length = labels.length;
    for (let index = 0; index < entry.payloads.length; index++) {
      if (entry.payloads[index]) entry.payloads[index].attackLabel = labels[index];
    }
  } else if (entry.mode === "all" && entry.payload) {
    entry.payload.attackLabels = labels;
  }
  return labels;
}

export function buildAttackExtraPart(payload) {
  if (!payload) return null;
  return {
    part: String(payload.penalty),
    source: `Called Shot: ${payload.locationLabel}`,
    value: payload.penalty
  };
}

export async function resolveTargetActor(targetUuid) {
  if (!targetUuid || !globalThis.fromUuid) return null;
  const document = await fromUuid(targetUuid);
  return document?.actor ?? document ?? null;
}

export function determineCalledShotSeverity({ damage = 0, crit = false, targetActor = null, debilitatingMinimum = 50 } = {}) {
  const hpMax = Number(getProperty(targetActor, "system.attributes.hp.max"));
  const minimum = Number(debilitatingMinimum) || 50;
  const threshold = Number.isFinite(hpMax) && hpMax > 0 ? Math.max(minimum, Math.ceil(hpMax / 2)) : minimum;
  if (Number(damage) >= threshold) return "debilitating";
  if (crit) return "critical";
  return "normal";
}

export async function applyCalledShotOutcome({
  targetActor,
  targetUuid,
  locationId,
  severity = "normal",
  profileId = null,
  context = {}
} = {}) {
  const profiles = getCalledShotProfiles();
  const profile = profiles.profiles.find((entry) => entry.id === profileId) ?? getActiveProfile(profiles);
  const location = getLocation(profile, locationId);
  if (!location) throw new Error(`Unknown called shot location: ${locationId}`);
  const actor = targetActor ?? await resolveTargetActor(targetUuid);
  if (!actor) throw new Error("No target actor was available for the called shot outcome.");
  const effects = location.outcomes?.[severity] ?? [];
  return applyOutcome(actor, effects, {
    ...context,
    locationId,
    locationLabel: location.label,
    severity,
    label: `${location.label} (${severity})`
  });
}

async function confirmCalledShotOutcome({ severity, context }) {
  if (!calledShotOutcomeNeedsConfirmation(severity)) return true;
  if (globalThis.game?.user?.isGM !== true) return false;
  const location = context?.payload?.locationLabel ?? "called shot";
  if (globalThis.Dialog?.confirm) {
    return Dialog.confirm({
      title: "Apply Severe Called Shot?",
      content: `<p>Apply the ${escapeHtml(severity)} outcome for ${escapeHtml(location)}? This can create long-lived or lethal target effects.</p>`,
      yes: () => true,
      no: () => false,
      defaultYes: false
    });
  }
  return globalThis.window?.confirm?.(`Apply the ${severity} called-shot outcome for ${location}?`) === true;
}

export async function applyAutomaticCalledShotOutcome({ targetActor, context, confirmOutcome = confirmCalledShotOutcome } = {}) {
  if (!targetActor || !context?.payload?.locationId) return null;
  if (context.hit !== true) return null;
  if (context.automaticHit === true) return null;
  const damage = Number(context.finalDamage?.damage ?? context.finalDamage?.displayDamage ?? 0);
  if (!Number.isFinite(damage) || damage <= 0) return null;
  const severity = determineCalledShotSeverity({
    damage,
    crit: context.crit === true,
    targetActor,
    debilitatingMinimum: context.payload.debilitatingMinimum
  });
  const outcomeMode = getCalledShotOutcomeMode();
  if (outcomeMode === OUTCOME_MODES.advisory) {
    return {
      applied: false,
      skipped: true,
      reason: "advisory",
      severity
    };
  }
  if (calledShotOutcomeNeedsConfirmation(severity, outcomeMode)) {
    if (globalThis.game?.user?.isGM !== true) {
      return {
        applied: false,
        skipped: true,
        reason: "requiresGmConfirmation",
        severity
      };
    }
    const confirmed = await confirmOutcome({ severity, context, targetActor, outcomeMode });
    if (!confirmed) {
      return {
        applied: false,
        skipped: true,
        reason: "declined",
        severity
      };
    }
  }
  return applyCalledShotOutcome({
    targetActor,
    locationId: context.payload.locationId,
    profileId: context.payload.profileId,
    severity,
    context: {
      automatic: true,
      outcomeMode,
      payload: context.payload,
      attackTotal: context.roll,
      saveDc: Number.isFinite(Number(context.roll)) ? Number(context.roll) : Number(context.finalAc?.ac),
      finalAc: context.finalAc,
      finalDamage: context.finalDamage,
      hit: context.hit,
      crit: context.crit,
      localArmor: context.localArmor
    }
  });
}

export function buildCalledShotCardPayload(payload) {
  const profiles = getCalledShotProfiles();
  const profile = profiles.profiles.find((entry) => entry.id === payload.profileId) ?? getActiveProfile(profiles);
  const location = getLocation(profile, payload.locationId);
  return {
    ...payload,
    profileLabel: profile.label,
    outcomes: location?.outcomes ?? {}
  };
}
