import { FLAGS, LOCAL_ARMOR_MODES, MODULE_ID, SETTINGS } from "./constants.js";
import {
  armorCoverageOverlaps,
  calculateArmorPieceLocalTotal,
  isAggregateArmorItem,
  isInternalArmorProfileItem,
  isPiecemealArmorPiece,
  normalizeArmorSlot,
  parseArmorCoverageSlots
} from "./armor.js";
import { ARMOR_PROFILE_STATUS, resolveArmorProfile } from "./armor-profile.js";

export { normalizeArmorSlot };

// D35E opens a Roll Defense dialog after Apply Damage; GMs may need time there
// before choosing the final defense mode, so this context must outlive a quick
// click-to-roll interaction.
const DAMAGE_CONTEXT_TTL_MS = 5 * 60 * 1000;
const damageContexts = new Map();

function getProperty(source, path) {
  if (!source || !path) return undefined;
  if (globalThis.foundry?.utils?.getProperty) return foundry.utils.getProperty(source, path);
  return path.split(".").reduce((current, key) => current?.[key], source);
}

function getFlagData(document, key) {
  return document?.getFlag?.(MODULE_ID, key) ?? document?.flags?.[MODULE_ID]?.[key] ?? null;
}

function getItems(source) {
  if (Array.isArray(source)) return source;
  if (source?.items?.contents) return source.items.contents;
  if (Array.isArray(source?.items)) return source.items;
  return [];
}

function numberOr(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function settingEnabled(key, fallback = false) {
  try {
    return globalThis.game?.settings?.get?.(MODULE_ID, key) ?? fallback;
  } catch (_error) {
    return fallback;
  }
}

function settingObject(key) {
  try {
    const value = globalThis.game?.settings?.get?.(MODULE_ID, key);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch (_error) {
    return {};
  }
}

function getUserId() {
  return globalThis.game?.user?.id ?? "node";
}

function isTrueDatasetValue(value) {
  return value === true || value === "true" || value === "1";
}

function actorUuidCandidates(actor) {
  const values = new Set([
    actor?.uuid,
    actor?.id ? `Actor.${actor.id}` : null,
    actor?.token?.uuid,
    actor?.token?.document?.uuid,
    actor?.prototypeToken?.uuid
  ].filter(Boolean));
  for (const token of actor?.getActiveTokens?.() ?? []) {
    if (token?.document?.uuid) values.add(token.document.uuid);
    if (token?.uuid) values.add(token.uuid);
  }
  return values;
}

function payloadMatchesActor(payload, actor) {
  if (!payload?.targetUuid || !actor) return false;
  return actorUuidCandidates(actor).has(payload.targetUuid);
}

export function stagedCalledShotMatchesActor(actor, userId = getUserId()) {
  const context = getStagedCalledShotDamageApplication(userId);
  return Boolean(context && payloadMatchesActor(context.payload, actor));
}

function findAggregateArmorItem(actor) {
  return getItems(actor).find((item) => {
    if (!isAggregateArmorItem(item)) return false;
    return item.system?.equipped !== false;
  }) ?? null;
}

function readAggregateArmorTotal(item) {
  const summary = getFlagData(item, FLAGS.aggregate)?.summary ?? {};
  return numberOr(summary.armorBonus, numberOr(getProperty(item, "system.armor.value"), 0)) +
    numberOr(summary.enhancementBonus, numberOr(getProperty(item, "system.armor.enh"), 0));
}

function formatSigned(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return number >= 0 ? `+${number}` : String(number);
}

function exposedSlotForCoverage(coverageSlot) {
  const slots = parseArmorCoverageSlots(coverageSlot);
  if (slots.includes("head") && settingEnabled(SETTINGS.enableExposedHeadshots, false)) {
    return { key: "head", label: "Head" };
  }
  if (slots.includes("hands") && settingEnabled(SETTINGS.enableExposedHandShots, false)) {
    return { key: "hands", label: "Hands" };
  }
  return null;
}

function localArmorLocationEnabled(payload) {
  if (!settingEnabled(SETTINGS.enableCalledShotLocalArmor, false)) return false;
  const locationId = String(payload?.locationId ?? "").trim();
  if (!locationId) return true;
  const locations = settingObject(SETTINGS.calledShotLocalArmorLocations);
  return locations[locationId] !== false;
}

function isEquippedInNativeSlot(item, slotKey) {
  return item?.type === "equipment" &&
    item.system?.equipped === true &&
    item.system?.carried !== false &&
    item.system?.melded !== true &&
    item.system?.slot === slotKey;
}

function activeNativeSlotItem(actor, slotKey) {
  return getItems(actor).find((item) => isEquippedInNativeSlot(item, slotKey)) ?? null;
}

function isNativeArmorContributor(item) {
  if (item?.type !== "equipment") return false;
  if (item.system?.equipmentType !== "armor") return false;
  if (item.system?.equipped !== true) return false;
  if (item.system?.carried === false || item.system?.melded === true || item.broken) return false;
  if (item.system?.slot && item.system.slot !== "armor") return false;
  if (isPiecemealArmorPiece(item) || isAggregateArmorItem(item) || isInternalArmorProfileItem(item)) return false;
  return true;
}

function nativeArmorContribution(item) {
  return numberOr(getProperty(item, "system.armor.value"), 0) +
    numberOr(getProperty(item, "system.armor.enh"), 0);
}

export function calculateActiveArmorContribution(actor) {
  if (!actor) return null;
  try {
    const profile = resolveArmorProfile(actor);
    if (profile.status !== ARMOR_PROFILE_STATUS.needsPieceValues && profile.pieces.length) {
      const total = numberOr(profile.summary?.armorBonus) + numberOr(profile.summary?.enhancementBonus);
      return total > 0 ? {
        total,
        source: "profile",
        armorBonus: numberOr(profile.summary?.armorBonus),
        enhancementBonus: numberOr(profile.summary?.enhancementBonus)
      } : null;
    }
  } catch (_error) {
    // Fall through to live item inspection when the profile cannot resolve.
  }

  const aggregate = findAggregateArmorItem(actor);
  if (aggregate) {
    const total = readAggregateArmorTotal(aggregate);
    return total > 0 ? {
      total,
      source: "carrier",
      itemId: aggregate.id ?? aggregate._id ?? null,
      itemName: aggregate.name ?? "PAcS armor profile"
    } : null;
  }

  const nativeArmors = getItems(actor)
    .filter(isNativeArmorContributor)
    .map((item) => ({
      item,
      total: nativeArmorContribution(item)
    }))
    .filter((entry) => entry.total > 0)
    .sort((a, b) => b.total - a.total);
  const strongest = nativeArmors[0];
  return strongest ? {
    total: strongest.total,
    source: "nativeArmor",
    itemId: strongest.item.id ?? strongest.item._id ?? null,
    itemName: strongest.item.name ?? "Armor"
  } : null;
}

function exposedArmorSourceName(exposed, payload, mode) {
  const label = payload?.locationLabel ?? payload?.coverageSlot ?? exposed.coverageSlot;
  const suffix = mode === LOCAL_ARMOR_MODES.display ? " (advisory)" : "";
  return `Called Shot Exposed ${label}: no ${exposed.nativeSlotLabel}-slot item (armor ${exposed.aggregateTotal} -> 0)${suffix}`;
}

function localArmorSourceName(localArmor, payload, mode) {
  const label = payload?.locationLabel ?? payload?.coverageSlot ?? localArmor.coverageSlot;
  const sourceLabel = localArmor.profileSourceLabel ?? "profile";
  const suffix = mode === LOCAL_ARMOR_MODES.display ? " (advisory)" : "";
  return `Called Shot Local Armor: ${label} (${sourceLabel} ${localArmor.aggregateTotal} -> local piece ${localArmor.localTotal})${suffix}`;
}

function localArmorMode() {
  return LOCAL_ARMOR_MODES.adjust;
}

function pruneDamageContexts(now = Date.now()) {
  for (const [key, context] of damageContexts.entries()) {
    if (now - context.startedAt > DAMAGE_CONTEXT_TTL_MS) damageContexts.delete(key);
  }
}

function finalAcLooksLikeTouchAc(actor, finalAc) {
  const baseEntry = (finalAc?.acModifiers ?? []).find((entry) => entry?.sourceName === "AC" || entry?.sourceName === "Armor Class");
  const baseAc = Number(baseEntry?.value);
  const touchAc = Number(getProperty(actor, "system.attributes.ac.touch.total"));
  const normalAc = Number(getProperty(actor, "system.attributes.ac.normal.total"));
  return Number.isFinite(baseAc) &&
    Number.isFinite(touchAc) &&
    baseAc === touchAc &&
    (!Number.isFinite(normalAc) || normalAc !== touchAc);
}

function applyCalledShotNormalAcForTouch(actor, finalAc, { touch = false } = {}) {
  if (!finalAc || finalAc.noCheck) return null;
  if (!touch && !finalAcLooksLikeTouchAc(actor, finalAc)) return null;
  const normalAc = Number(getProperty(actor, "system.attributes.ac.normal.total"));
  const currentAc = Number(finalAc.ac);
  if (!Number.isFinite(normalAc) || !Number.isFinite(currentAc) || normalAc === currentAc) return null;
  const adjustment = normalAc - currentAc;
  finalAc.acModifiers = Array.isArray(finalAc.acModifiers) ? finalAc.acModifiers : [];
  finalAc.acModifiers.push({
    sourceName: "Called Shot Normal AC",
    value: formatSigned(adjustment)
  });
  finalAc.ac = normalAc;
  return {
    sourceName: "Called Shot Normal AC",
    adjustment,
    adjusted: true
  };
}

function applyCalledShotCoverAdjustment(finalAc) {
  if (!finalAc || finalAc.noCheck || finalAc._d35ePacsCoverAdjusted) return null;
  const modifiers = Array.isArray(finalAc.acModifiers) ? finalAc.acModifiers : [];
  const coverBonus = modifiers.reduce((total, entry) => {
    const source = String(entry?.sourceName ?? "");
    if (!/cover/i.test(source) || /soft/i.test(source)) return total;
    const value = Number(String(entry?.value ?? "").replace(/^\+/, ""));
    return total + (Number.isFinite(value) && value > 0 ? value : 0);
  }, 0);
  if (!coverBonus) return null;
  finalAc.acModifiers = modifiers;
  finalAc.acModifiers.push({
    sourceName: "Called Shot Cover",
    value: formatSigned(coverBonus)
  });
  if (Number.isFinite(Number(finalAc.ac))) finalAc.ac = Number(finalAc.ac) + coverBonus;
  finalAc._d35ePacsCoverAdjusted = true;
  return { adjustment: coverBonus, adjusted: true };
}

export function sanitizeCalledShotDamagePayload(payload) {
  if (!payload?.locationId) return null;
  return {
    userId: payload.userId ?? null,
    actorId: payload.actorId ?? null,
    itemId: payload.itemId ?? null,
    targetUuid: payload.targetUuid ?? null,
    profileId: payload.profileId ?? null,
    locationId: payload.locationId,
    locationLabel: payload.locationLabel ?? payload.locationId,
    penalty: numberOr(payload.penalty),
    rulesMode: payload.rulesMode ?? null,
    calledShotFeats: payload.calledShotFeats ?? null,
    debilitatingMinimum: payload.debilitatingMinimum ?? null,
    attackLabel: payload.attackLabel ?? null,
    coverageSlot: payload.coverageSlot ?? null,
    stagedAt: payload.stagedAt ?? null
  };
}

export function attachCalledShotToDamageCard(card, payload) {
  const damagePayload = sanitizeCalledShotDamagePayload(payload);
  return damagePayload ? { ...card, d35ePacsCalledShot: damagePayload } : card;
}

export function extractCalledShotDamagePayloads(chatTemplateData = {}) {
  const payloads = [];
  const hasHalfApplyButton = chatTemplateData.dc?.isHalf === true;
  for (const attack of chatTemplateData.attacks ?? []) {
    for (const card of attack.cards ?? []) {
      const payload = sanitizeCalledShotDamagePayload(card?.d35ePacsCalledShot);
      payloads.push(payload);
      if (hasHalfApplyButton) payloads.push(payload);
    }
    for (const card of attack.altCards ?? []) {
      payloads.push(sanitizeCalledShotDamagePayload(card?.d35ePacsCalledShot));
    }
  }
  return payloads;
}

export function stageCalledShotDamageApplication(payload, { userId = getUserId(), messageId = null, touch = false } = {}) {
  const damagePayload = sanitizeCalledShotDamagePayload(payload);
  if (!damagePayload?.targetUuid || !damagePayload.coverageSlot) return null;
  const context = {
    payload: damagePayload,
    messageId,
    touch,
    startedAt: Date.now(),
    hit: null,
    crit: null,
    roll: null,
    finalAc: null,
    finalDamage: null,
    localArmor: null,
    automaticHit: false,
    finalized: false
  };
  damageContexts.set(userId, context);
  return context;
}

export function getStagedCalledShotDamageApplication(userId = getUserId(), now = Date.now()) {
  pruneDamageContexts(now);
  return damageContexts.get(userId) ?? null;
}

export function clearStagedCalledShotDamageApplication(userId = getUserId()) {
  return damageContexts.delete(userId);
}

export function clearAllStagedCalledShotDamageApplications() {
  const count = damageContexts.size;
  damageContexts.clear();
  return count;
}

function payloadFromCoverage(coverageSlotOrPayload, extra = {}) {
  if (coverageSlotOrPayload && typeof coverageSlotOrPayload === "object") {
    return {
      ...coverageSlotOrPayload,
      ...extra,
      coverageSlot: coverageSlotOrPayload.coverageSlot ?? extra.coverageSlot ?? null
    };
  }
  return { ...extra, coverageSlot: coverageSlotOrPayload };
}

function profileSourceLabel(resolution) {
  return resolution?.status === ARMOR_PROFILE_STATUS.nativeArmor ? "full armor" : "profile";
}

function calculateLocalArmorPieceAdjustment(actor, payload) {
  const coverageSlot = payload?.coverageSlot;
  const normalizedSlots = parseArmorCoverageSlots(coverageSlot);
  if (!actor || !normalizedSlots.length || !localArmorLocationEnabled(payload)) return null;

  let resolution;
  try {
    resolution = resolveArmorProfile(actor);
  } catch (_error) {
    return null;
  }
  if (!resolution?.pieces?.length || resolution.status === ARMOR_PROFILE_STATUS.needsPieceValues) return null;

  const summary = resolution.summary ?? {};
  const aggregateTotal = numberOr(summary.armorBonus) + numberOr(summary.enhancementBonus);
  if (!aggregateTotal) return null;

  const activePieces = Array.isArray(summary.activePieces) && summary.activePieces.length
    ? summary.activePieces
    : resolution.pieces;
  const matchingPieces = activePieces.filter((piece) => armorCoverageOverlaps(piece.coverageSlots, coverageSlot));
  const localTotal = matchingPieces.reduce((total, piece) => total + calculateArmorPieceLocalTotal(summary, piece), 0);
  const adjustment = localTotal - aggregateTotal;
  return {
    coverageSlot,
    normalizedSlot: normalizedSlots[0],
    normalizedSlots,
    aggregateTotal,
    localTotal,
    adjustment,
    pieceCount: matchingPieces.length,
    source: "localArmor",
    profileSourceLabel: profileSourceLabel(resolution),
    armorContribution: {
      total: aggregateTotal,
      source: resolution.status,
      armorBonus: numberOr(summary.armorBonus),
      enhancementBonus: numberOr(summary.enhancementBonus)
    },
    pieces: matchingPieces
  };
}

function calculateExposedArmorAdjustment(actor, payload) {
  const coverageSlot = payload?.coverageSlot;
  const normalizedSlots = parseArmorCoverageSlots(coverageSlot);
  if (!actor || !normalizedSlots.length) return null;
  const exposedSlot = exposedSlotForCoverage(coverageSlot);
  if (!exposedSlot) return null;
  const occupyingItem = activeNativeSlotItem(actor, exposedSlot.key);
  if (occupyingItem) return null;
  const armorContribution = calculateActiveArmorContribution(actor);
  if (!armorContribution?.total) return null;
  return {
    coverageSlot,
    normalizedSlot: normalizedSlots[0],
    normalizedSlots,
    aggregateTotal: armorContribution.total,
    localTotal: 0,
    adjustment: -armorContribution.total,
    pieceCount: 0,
    source: "exposed",
    nativeSlot: exposedSlot.key,
    nativeSlotLabel: exposedSlot.label,
    armorContribution,
    pieces: []
  };
}

export function calculateLocalArmorAdjustment(actor, coverageSlotOrPayload, extra = {}) {
  const payload = payloadFromCoverage(coverageSlotOrPayload, extra);
  return calculateLocalArmorPieceAdjustment(actor, payload) ?? calculateExposedArmorAdjustment(actor, payload);
}

export function applyLocalArmorAdjustment(actor, finalAc, payload, { mode = LOCAL_ARMOR_MODES.adjust, touch = false } = {}) {
  if (!finalAc || finalAc.noCheck) return null;
  const coverAdjustment = applyCalledShotCoverAdjustment(finalAc);
  const touchAdjustment = applyCalledShotNormalAcForTouch(actor, finalAc, { touch });
  if (mode === LOCAL_ARMOR_MODES.disabled) return null;

  const localArmor = calculateLocalArmorAdjustment(actor, payload);
  if (!localArmor) return touchAdjustment ?? coverAdjustment;

  finalAc.acModifiers = Array.isArray(finalAc.acModifiers) ? finalAc.acModifiers : [];
  const sourceName = localArmor.source === "localArmor"
    ? localArmorSourceName(localArmor, payload, mode)
    : exposedArmorSourceName(localArmor, payload, mode);
  finalAc.acModifiers.push({
    sourceName,
    value: formatSigned(localArmor.adjustment)
  });

  if (mode === LOCAL_ARMOR_MODES.adjust && Number.isFinite(Number(finalAc.ac))) {
    finalAc.ac = Number(finalAc.ac) + localArmor.adjustment;
  }

  return {
    ...localArmor,
    mode,
    sourceName,
    adjusted: mode === LOCAL_ARMOR_MODES.adjust,
    touchAdjustment,
    coverAdjustment
  };
}

export function applyStagedCalledShotLocalArmor(actor, finalAc, userId = getUserId()) {
  const context = getStagedCalledShotDamageApplication(userId);
  if (!context || !payloadMatchesActor(context.payload, actor)) return null;
  const result = applyLocalArmorAdjustment(actor, finalAc, context.payload, {
    mode: localArmorMode(),
    touch: context.touch
  });
  context.localArmor = result;
  return result;
}

export function applyCalledShotConcealmentAdjustment(actor, hookValues, userId = getUserId()) {
  if (!stagedCalledShotMatchesActor(actor, userId)) return null;
  const current = Number(hookValues?.concealTarget ?? 0);
  let adjusted = current;
  if (current >= 50) adjusted = 100;
  else if (current === 20) adjusted = 50;
  else if (current > 0) adjusted = Math.min(100, current * 2);
  if (adjusted === current) return null;
  hookValues.concealTarget = adjusted;
  return { original: current, adjusted };
}

export function noteCalledShotDamageHit(actor, hookValues, userId = getUserId()) {
  const context = getStagedCalledShotDamageApplication(userId);
  if (!context || !payloadMatchesActor(context.payload, actor)) return null;
  context.hit = hookValues?.hit === true;
  context.crit = hookValues?.crit === true;
  context.roll = Number(hookValues?.roll);
  context.automaticHit = Number(hookValues?.roll) === -1337 || hookValues?.automaticHit === true;
  context.finalAc = hookValues?.finalAc ?? null;
  context.targetActor = actor;
  return context;
}

export function noteCalledShotFinalDamage(actor, finalDamage, userId = getUserId()) {
  const context = getStagedCalledShotDamageApplication(userId);
  if (!context || !payloadMatchesActor(context.payload, actor)) return null;
  context.finalDamage = finalDamage ?? null;
  context.targetActor = actor;
  return context;
}

export function takeCalledShotDamageContext(userId = getUserId()) {
  const context = getStagedCalledShotDamageApplication(userId);
  if (context) clearStagedCalledShotDamageApplication(userId);
  return context ?? null;
}
