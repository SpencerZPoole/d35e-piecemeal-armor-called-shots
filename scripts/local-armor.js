import { FLAGS, LOCAL_ARMOR_MODES, MODULE_ID, SETTINGS } from "./constants.js";
import {
  armorCoverageOverlaps,
  getPiecemealArmorPieces,
  isAggregateArmorItem,
  normalizeArmorSlot,
  parseArmorCoverageSlots,
  readArmorPiece
} from "./armor.js";

export { normalizeArmorSlot };

const DAMAGE_CONTEXT_TTL_MS = 30000;
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

function armorPieceTotal(piece) {
  return numberOr(piece.armorBonus) + numberOr(piece.enhancementBonus);
}

function formatSigned(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return number >= 0 ? `+${number}` : String(number);
}

function localArmorMode() {
  try {
    return game.settings.get(MODULE_ID, SETTINGS.calledShotLocalArmorMode);
  } catch (_error) {
    return LOCAL_ARMOR_MODES.adjust;
  }
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
    startedAt: Date.now()
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

export function calculateLocalArmorAdjustment(actor, coverageSlot) {
  const normalizedSlots = parseArmorCoverageSlots(coverageSlot);
  if (!actor || !normalizedSlots.length) return null;

  const aggregate = findAggregateArmorItem(actor);
  if (!aggregate) return null;
  const aggregateTotal = readAggregateArmorTotal(aggregate);

  const pieces = getPiecemealArmorPieces(actor).map(readArmorPiece);
  const matchingPieces = pieces.filter((piece) => armorCoverageOverlaps(piece.slot, coverageSlot));
  if (!matchingPieces.length) return null;

  const localTotal = matchingPieces.reduce((total, piece) => total + armorPieceTotal(piece), 0);
  return {
    coverageSlot,
    normalizedSlot: normalizedSlots[0],
    normalizedSlots,
    aggregateTotal,
    localTotal,
    adjustment: localTotal - aggregateTotal,
    pieceCount: matchingPieces.length,
    pieces: matchingPieces.map((piece) => ({ id: piece.id, name: piece.name, total: armorPieceTotal(piece) }))
  };
}

export function applyLocalArmorAdjustment(actor, finalAc, payload, { mode = LOCAL_ARMOR_MODES.adjust, touch = false } = {}) {
  if (!finalAc || finalAc.noCheck) return null;
  if (mode === LOCAL_ARMOR_MODES.disabled) return null;
  if (touch || finalAcLooksLikeTouchAc(actor, finalAc)) return null;

  const localArmor = calculateLocalArmorAdjustment(actor, payload?.coverageSlot);
  if (!localArmor) return null;

  finalAc.acModifiers = Array.isArray(finalAc.acModifiers) ? finalAc.acModifiers : [];
  const label = payload?.locationLabel ?? payload?.coverageSlot ?? localArmor.coverageSlot;
  const sourceName = mode === LOCAL_ARMOR_MODES.display
    ? `Called Shot Local Armor: ${label} (advisory)`
    : `Called Shot Local Armor: ${label}`;
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
    adjusted: mode === LOCAL_ARMOR_MODES.adjust
  };
}

export function applyStagedCalledShotLocalArmor(actor, finalAc, userId = getUserId()) {
  const context = getStagedCalledShotDamageApplication(userId);
  if (!context || !payloadMatchesActor(context.payload, actor)) return null;
  const result = applyLocalArmorAdjustment(actor, finalAc, context.payload, {
    mode: localArmorMode(),
    touch: context.touch
  });
  clearStagedCalledShotDamageApplication(userId);
  return result;
}
