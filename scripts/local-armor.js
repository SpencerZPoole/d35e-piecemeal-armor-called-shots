import { FLAGS, LOCAL_ARMOR_MODES, MODULE_ID } from "./constants.js";
import {
  armorCoverageOverlaps,
  calculateArmorPieceLocalTotal,
  calculatePiecemealArmor,
  getPiecemealArmorPieces,
  isAggregateArmorItem,
  normalizeArmorSlot,
  parseArmorCoverageSlots,
  readArmorPiece
} from "./armor.js";
import { ARMOR_PROFILE_STATUS, resolveArmorProfile } from "./armor-profile.js";
import { findActiveHelmetCoverage, isHeadCoverageTarget, isHelmetHeadCoverageEnabled } from "./helmet.js";

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

function pieceCoversCalledShot(piece, coverageSlot) {
  const pieceCoverage = piece.coverageSlots ?? piece.slot;
  if (armorCoverageOverlaps(pieceCoverage, coverageSlot)) return true;
  const targetSlots = parseArmorCoverageSlots(coverageSlot);
  if (piece.pieceCategory === "torso" && targetSlots.some((slot) => ["torso", "head", "neck"].includes(slot))) return true;
  return false;
}

function formatSigned(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return number >= 0 ? `+${number}` : String(number);
}

function profileLocationArmor(summary, coverageSlot) {
  const pieces = Array.isArray(summary?.activePieces) ? summary.activePieces : [];
  const matchingPieces = pieces.filter((piece) => pieceCoversCalledShot(piece, coverageSlot));
  return {
    pieces: matchingPieces,
    localTotal: matchingPieces.reduce((total, piece) => total + calculateArmorPieceLocalTotal(summary, piece), 0),
    pieceCount: matchingPieces.length
  };
}

function localArmorSourceName(localArmor, payload, mode) {
  const label = payload?.locationLabel ?? payload?.coverageSlot ?? localArmor.coverageSlot;
  const aggregate = numberOr(localArmor?.aggregateTotal);
  const local = numberOr(localArmor?.localTotal);
  const localLabel = localArmor?.source === "helmet"
    ? localArmor.pieceCount ? "helmet" : "no helmet"
    : "location";
  const suffix = mode === LOCAL_ARMOR_MODES.display ? " (advisory)" : "";
  return `Called Shot Location Armor: ${label} (profile ${aggregate} -> ${localLabel} ${local})${suffix}`;
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

export function calculateLocalArmorAdjustment(actor, coverageSlot) {
  const normalizedSlots = parseArmorCoverageSlots(coverageSlot);
  if (!actor || !normalizedSlots.length) return null;
  const helmetRuleActive = isHelmetHeadCoverageEnabled() && isHeadCoverageTarget(coverageSlot);

  let aggregateTotal = null;
  let summary = null;
  try {
    const profile = resolveArmorProfile(actor);
    if (profile.status !== ARMOR_PROFILE_STATUS.needsPieceValues && profile.pieces.length) {
      summary = profile.summary;
      aggregateTotal = summary.armorBonus + summary.enhancementBonus;
    }
  } catch (_error) {
    summary = null;
  }

  if (!summary) {
    const aggregate = findAggregateArmorItem(actor);
    if (aggregate) {
      aggregateTotal = readAggregateArmorTotal(aggregate);
      summary = calculatePiecemealArmor(actor);
    } else if (helmetRuleActive) {
      aggregateTotal = 0;
      summary = { armorBonus: 0, enhancementBonus: 0, activePieces: [] };
    } else {
      return null;
    }
  }

  if (helmetRuleActive) {
    const inherited = profileLocationArmor(summary, coverageSlot);
    const helmet = findActiveHelmetCoverage(actor, coverageSlot, { inheritedArmor: inherited.localTotal });
    if (!helmet) return null;
    const localTotal = helmet.localArmorBonus;
    if (aggregateTotal === 0 && localTotal === 0) return null;
    return {
      coverageSlot,
      normalizedSlot: normalizedSlots[0],
      normalizedSlots,
      aggregateTotal,
      localTotal,
      adjustment: localTotal - aggregateTotal,
      pieceCount: helmet.id ? 1 : 0,
      source: "helmet",
      inheritedLocalTotal: inherited.localTotal,
      inheritedPieces: inherited.pieces.map((piece) => ({ id: piece.id, name: piece.name, total: calculateArmorPieceLocalTotal(summary, piece) })),
      helmetCap: helmet.cap,
      helmetArmorBonus: helmet.localArmorBonus,
      helmetName: helmet.name,
      pieces: helmet.id ? [{ id: helmet.id, name: helmet.name, total: localTotal }] : []
    };
  }

  const pieces = (summary.activePieces?.length ? summary.activePieces : getPiecemealArmorPieces(actor).map(readArmorPiece));
  const matchingPieces = pieces.filter((piece) => pieceCoversCalledShot(piece, coverageSlot));
  if (!matchingPieces.length) return null;

  const localTotal = matchingPieces.reduce((total, piece) => total + calculateArmorPieceLocalTotal(summary, piece), 0);
  return {
    coverageSlot,
    normalizedSlot: normalizedSlots[0],
    normalizedSlots,
    aggregateTotal,
    localTotal,
    adjustment: localTotal - aggregateTotal,
    pieceCount: matchingPieces.length,
    pieces: matchingPieces.map((piece) => ({ id: piece.id, name: piece.name, total: calculateArmorPieceLocalTotal(summary, piece) }))
  };
}

export function applyLocalArmorAdjustment(actor, finalAc, payload, { mode = LOCAL_ARMOR_MODES.adjust, touch = false } = {}) {
  if (!finalAc || finalAc.noCheck) return null;
  const coverAdjustment = applyCalledShotCoverAdjustment(finalAc);
  const touchAdjustment = applyCalledShotNormalAcForTouch(actor, finalAc, { touch });
  if (mode === LOCAL_ARMOR_MODES.disabled) return null;

  const localArmor = calculateLocalArmorAdjustment(actor, payload?.coverageSlot);
  if (!localArmor) return touchAdjustment ?? coverAdjustment;

  finalAc.acModifiers = Array.isArray(finalAc.acModifiers) ? finalAc.acModifiers : [];
  const sourceName = localArmorSourceName(localArmor, payload, mode);
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
