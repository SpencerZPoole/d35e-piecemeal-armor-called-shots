import { MODULE_ID, SETTINGS } from "./constants.js";
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

function buildCalledShotPayload(actor, item, locationId, options = {}) {
  const profiles = options.profiles ?? getCalledShotProfiles();
  const profile = options.profile ?? getActiveProfile(profiles);
  const location = getLocation(profile, locationId);
  if (!location) throw new Error(`Unknown called shot location: ${locationId}`);

  return {
    userId: options.userId ?? getUserId(),
    actorId: actor?.id ?? item?.actor?.id ?? null,
    itemId: item?.id ?? null,
    targetUuid: options.targetUuid ?? null,
    profileId: profile.id,
    locationId: location.id,
    locationLabel: location.label,
    penalty: Number(location.penalty) || 0,
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
  const payloads = (locationIds ?? []).map((locationId) => {
    if (!locationId || locationId === "none") return null;
    return buildCalledShotPayload(actor, item, locationId, { ...options, userId });
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
  if (entry.mode === "all") return entry.payload;
  const payload = entry;
  pendingCalledShots.delete(key);
  return payload;
}

export function clearCalledShot(actor, item, userId = getUserId()) {
  return pendingCalledShots.delete(pendingKey(actor, item, userId));
}

export function getPendingCalledShot(actor, item, userId = getUserId()) {
  return pendingPayload(pendingCalledShots.get(pendingKey(actor, item, userId))) ?? null;
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

export async function applyCalledShotOutcome({ targetActor, targetUuid, locationId, severity = "normal", profileId = null } = {}) {
  const profiles = getCalledShotProfiles();
  const profile = profiles.profiles.find((entry) => entry.id === profileId) ?? getActiveProfile(profiles);
  const location = getLocation(profile, locationId);
  if (!location) throw new Error(`Unknown called shot location: ${locationId}`);
  const actor = targetActor ?? await resolveTargetActor(targetUuid);
  if (!actor) throw new Error("No target actor was available for the called shot outcome.");
  const effects = location.outcomes?.[severity] ?? [];
  return applyOutcome(actor, effects, {
    locationId,
    severity,
    label: `${location.label} (${severity})`
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
