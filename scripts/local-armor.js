import {
  FLAGS,
  LOCAL_ARMOR_AGGREGATION_MODES,
  LOCAL_ARMOR_MODES,
  MODULE_ID,
  PIECE_CATEGORIES,
  SETTINGS
} from "./constants.js";
import {
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

const NATIVE_SLOT_LABELS = Object.freeze({
  eyes: "Eyes",
  head: "Head",
  headband: "Headband",
  shoulders: "Shoulders",
  neck: "Neck",
  chest: "Chest",
  body: "Body",
  hands: "Hands",
  wrists: "Wrists",
  feet: "Feet"
});

const PACS_CATEGORY_LABELS = Object.freeze({
  [PIECE_CATEGORIES.arms]: "PAcS Arms",
  [PIECE_CATEGORIES.legs]: "PAcS Legs",
  [PIECE_CATEGORIES.torso]: "PAcS Torso"
});

export const LOCAL_ARMOR_PACS_SOURCES = Object.freeze([
  PIECE_CATEGORIES.torso,
  PIECE_CATEGORIES.arms,
  PIECE_CATEGORIES.legs
]);

export const LOCAL_ARMOR_NATIVE_SOURCES = Object.freeze(Object.keys(NATIVE_SLOT_LABELS));

const DEFAULT_LOCAL_ARMOR_PROTECTION_MAP = Object.freeze({
  arm: Object.freeze({ pacs: Object.freeze([PIECE_CATEGORIES.arms]), native: Object.freeze(["wrists", "shoulders"]) }),
  hand: Object.freeze({ pacs: Object.freeze([]), native: Object.freeze(["hands", "wrists"]) }),
  eye: Object.freeze({ pacs: Object.freeze([]), native: Object.freeze(["eyes", "head", "headband"]) }),
  ear: Object.freeze({ pacs: Object.freeze([]), native: Object.freeze(["head", "headband"]) }),
  head: Object.freeze({ pacs: Object.freeze([]), native: Object.freeze(["head", "headband"]) }),
  neck: Object.freeze({ pacs: Object.freeze([]), native: Object.freeze(["neck"]) }),
  chest: Object.freeze({ pacs: Object.freeze([PIECE_CATEGORIES.torso]), native: Object.freeze(["chest", "body"]) }),
  heart: Object.freeze({ pacs: Object.freeze([PIECE_CATEGORIES.torso]), native: Object.freeze(["chest", "body"]) }),
  vitals: Object.freeze({ pacs: Object.freeze([PIECE_CATEGORIES.torso]), native: Object.freeze(["chest", "body"]) }),
  leg: Object.freeze({ pacs: Object.freeze([PIECE_CATEGORIES.legs]), native: Object.freeze(["feet"]) })
});

const LOCATION_ALIASES = Object.freeze({
  arms: "arm",
  arm: "arm",
  wing: "arm",
  wings: "arm",
  hand: "hand",
  hands: "hand",
  eye: "eye",
  eyes: "eye",
  ear: "ear",
  ears: "ear",
  head: "head",
  neck: "neck",
  throat: "neck",
  chest: "chest",
  torso: "chest",
  body: "chest",
  heart: "heart",
  vitals: "vitals",
  vital: "vitals",
  leg: "leg",
  legs: "leg",
  foot: "leg",
  feet: "leg"
});

const NATIVE_SLOT_ALIASES = Object.freeze({
  eye: "eyes",
  eyes: "eyes",
  head: "head",
  helm: "head",
  helmet: "head",
  headband: "headband",
  shoulders: "shoulders",
  shoulder: "shoulders",
  neck: "neck",
  throat: "neck",
  chest: "chest",
  body: "body",
  torso: "body",
  hands: "hands",
  hand: "hands",
  gloves: "hands",
  wrists: "wrists",
  wrist: "wrists",
  bracers: "wrists",
  feet: "feet",
  foot: "feet",
  boots: "feet"
});

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

function compactKey(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeCalledShotLocationId(value) {
  const key = compactKey(value);
  return LOCATION_ALIASES[key] ?? key;
}

function locationIdFromCoverage(coverageSlot) {
  const raw = String(coverageSlot ?? "").toLowerCase();
  const ordered = [
    ["eye", /\beyes?\b/],
    ["ear", /\bears?\b/],
    ["hand", /\bhands?\b/],
    ["head", /\bhead\b/],
    ["neck", /\b(neck|throat)\b/],
    ["heart", /\bheart\b/],
    ["vitals", /\bvitals?\b/],
    ["chest", /\b(chest|torso|body)\b/],
    ["leg", /\b(legs?|feet|foot)\b/],
    ["arm", /\b(arms?|wings?)\b/]
  ];
  for (const [locationId, pattern] of ordered) {
    if (pattern.test(raw)) return locationId;
  }
  const slots = parseArmorCoverageSlots(coverageSlot);
  return normalizeCalledShotLocationId(slots[0] ?? "");
}

function explicitLocationIdFromInput(locationOrPayload) {
  if (locationOrPayload && typeof locationOrPayload === "object") {
    return normalizeCalledShotLocationId(locationOrPayload.locationId ?? locationOrPayload.id);
  }
  return normalizeCalledShotLocationId(locationOrPayload);
}

function defaultProtectionForLocationId(locationId) {
  return DEFAULT_LOCAL_ARMOR_PROTECTION_MAP[normalizeCalledShotLocationId(locationId)] ?? null;
}

function locationIdFromPayload(payload) {
  const explicitId = normalizeCalledShotLocationId(payload?.locationId);
  if (defaultProtectionForLocationId(explicitId)) return explicitId;
  return locationIdFromCoverage(payload?.coverageSlot) || explicitId;
}

function normalizePacsSourceKey(value) {
  const key = compactKey(value);
  if (key === "torso" || key === "pacstorso" || key === "chest" || key === "body") return PIECE_CATEGORIES.torso;
  if (key === "arms" || key === "arm" || key === "pacsarms") return PIECE_CATEGORIES.arms;
  if (key === "legs" || key === "leg" || key === "pacslegs" || key === "feet") return PIECE_CATEGORIES.legs;
  return "";
}

function uniqueNormalized(values, normalizer, allowedValues) {
  const allowed = new Set(allowedValues);
  const normalized = [];
  for (const value of Array.isArray(values) ? values : []) {
    const key = normalizer(value);
    if (!key || !allowed.has(key) || normalized.includes(key)) continue;
    normalized.push(key);
  }
  return Object.freeze(normalized);
}

function normalizeProtectionEntry(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return Object.freeze({
    pacs: uniqueNormalized(value.pacs, normalizePacsSourceKey, LOCAL_ARMOR_PACS_SOURCES),
    native: uniqueNormalized(value.native, normalizeNativeSlotKey, LOCAL_ARMOR_NATIVE_SOURCES)
  });
}

export function normalizeCalledShotLocalArmorCoverageMap(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const normalized = {};
  for (const [rawKey, rawEntry] of Object.entries(source)) {
    const locationId = normalizeCalledShotLocationId(rawKey);
    const entry = normalizeProtectionEntry(rawEntry);
    if (!locationId || !entry) continue;
    normalized[locationId] = entry;
  }
  return normalized;
}

export function normalizeCalledShotLocalArmorAggregation(value, fallback = LOCAL_ARMOR_AGGREGATION_MODES.sum) {
  if (value === LOCAL_ARMOR_AGGREGATION_MODES.highest) return LOCAL_ARMOR_AGGREGATION_MODES.highest;
  if (value === LOCAL_ARMOR_AGGREGATION_MODES.perLocation) return LOCAL_ARMOR_AGGREGATION_MODES.perLocation;
  if (fallback === null) return null;
  return fallback === LOCAL_ARMOR_AGGREGATION_MODES.highest
    ? LOCAL_ARMOR_AGGREGATION_MODES.highest
    : LOCAL_ARMOR_AGGREGATION_MODES.sum;
}

export function normalizeCalledShotLocalArmorAggregationMap(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const normalized = {};
  for (const [rawKey, rawMode] of Object.entries(source)) {
    const locationId = normalizeCalledShotLocationId(rawKey);
    if (!locationId) continue;
    const mode = normalizeCalledShotLocalArmorAggregation(rawMode, null);
    if (mode === LOCAL_ARMOR_AGGREGATION_MODES.sum || mode === LOCAL_ARMOR_AGGREGATION_MODES.highest) {
      normalized[locationId] = mode;
    }
  }
  return normalized;
}

function localArmorCoverageOverrides() {
  return normalizeCalledShotLocalArmorCoverageMap(settingObject(SETTINGS.calledShotLocalArmorCoverageMap));
}

function localArmorAggregationOverrides() {
  return normalizeCalledShotLocalArmorAggregationMap(settingObject(SETTINGS.calledShotLocalArmorAggregationMap));
}

function defaultProtectionForInput(locationOrPayload) {
  const fallbackId = locationOrPayload && typeof locationOrPayload === "object"
    ? locationIdFromPayload(locationOrPayload)
    : normalizeCalledShotLocationId(locationOrPayload);
  const protection = defaultProtectionForLocationId(fallbackId);
  return { locationId: fallbackId, protection };
}

export function defaultCalledShotLocalArmorProtectionForLocation(locationOrPayload) {
  const { locationId, protection } = defaultProtectionForInput(locationOrPayload);
  const fallback = protection ?? Object.freeze({ pacs: Object.freeze([]), native: Object.freeze([]) });
  return protectionDetails(locationId, fallback);
}

function protectionForInput(locationOrPayload, overrides = localArmorCoverageOverrides()) {
  const explicitId = explicitLocationIdFromInput(locationOrPayload);
  if (explicitId && hasOwn(overrides, explicitId)) {
    return { locationId: explicitId, protection: overrides[explicitId] };
  }
  const { locationId, protection } = defaultProtectionForInput(locationOrPayload);
  if (locationId && hasOwn(overrides, locationId)) {
    return { locationId, protection: overrides[locationId] };
  }
  return { locationId, protection };
}

function protectionForLocationId(locationId) {
  return protectionForInput(locationId).protection;
}

function protectionDetails(locationId, protection) {
  const pacsCategories = protection?.pacs ?? [];
  const nativeSlots = protection?.native ?? [];
  const labels = [
    ...pacsCategories.map((category) => PACS_CATEGORY_LABELS[category] ?? category),
    ...nativeSlots.map((slot) => NATIVE_SLOT_LABELS[slot] ?? slot)
  ];
  return {
    locationId,
    pacsCategories,
    nativeSlots,
    labels,
    displayLabel: labels.length ? labels.join(", ") : "no mapped local armor source",
    protection
  };
}

export function calledShotLocalArmorProtectionForLocation(locationOrPayload, coverageMap = null) {
  const overrides = coverageMap === null ? localArmorCoverageOverrides() : normalizeCalledShotLocalArmorCoverageMap(coverageMap);
  const { locationId, protection } = protectionForInput(locationOrPayload, overrides);
  return protectionDetails(locationId, protection);
}

export function calledShotLocalArmorProtectionLabel(locationOrPayload, coverageMap = null) {
  return calledShotLocalArmorProtectionForLocation(locationOrPayload, coverageMap).displayLabel;
}

export function calledShotLocalArmorCoverageSourceOptions() {
  return {
    pacs: LOCAL_ARMOR_PACS_SOURCES.map((value) => ({
      value,
      label: PACS_CATEGORY_LABELS[value] ?? value
    })),
    native: LOCAL_ARMOR_NATIVE_SOURCES.map((value) => ({
      value,
      label: NATIVE_SLOT_LABELS[value] ?? value
    }))
  };
}

function localArmorLocationEnabled(payload) {
  if (!settingEnabled(SETTINGS.enableArmor, true)) return false;
  if (!settingEnabled(SETTINGS.enableCalledShots, true)) return false;
  if (!settingEnabled(SETTINGS.enableCalledShotLocalArmor, false)) return false;
  const locationId = normalizeCalledShotLocationId(payload?.locationId) || locationIdFromPayload(payload);
  if (!locationId) return true;
  const locations = settingObject(SETTINGS.calledShotLocalArmorLocations);
  return locations[locationId] !== false;
}

function normalizeNativeSlotKey(value) {
  const key = compactKey(value);
  return NATIVE_SLOT_ALIASES[key] ?? key;
}

function isActiveEquipmentItem(item) {
  return item?.type === "equipment" &&
    item.system?.equipped === true &&
    item.system?.carried !== false &&
    item.system?.melded !== true &&
    item.broken !== true;
}

function isEquippedInNativeSlot(item, slotKey) {
  return isActiveEquipmentItem(item) && normalizeNativeSlotKey(item.system?.slot) === normalizeNativeSlotKey(slotKey);
}

function activeNativeSlotItems(actor, slotKeys) {
  const keys = new Set((Array.isArray(slotKeys) ? slotKeys : [slotKeys]).map(normalizeNativeSlotKey).filter(Boolean));
  if (!keys.size) return [];
  return getItems(actor).filter((item) => isActiveEquipmentItem(item) && keys.has(normalizeNativeSlotKey(item.system?.slot)));
}

function activeNativeSlotItem(actor, slotKey) {
  return activeNativeSlotItems(actor, slotKey)[0] ?? null;
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

function hasOwn(source, key) {
  return Boolean(source && Object.prototype.hasOwnProperty.call(source, key));
}

function numberIfPresent(source, key) {
  if (!hasOwn(source, key)) return null;
  const number = Number(source[key]);
  return Number.isFinite(number) ? number : null;
}

function explicitFlagArmorValue(flag) {
  if (!flag || typeof flag !== "object") return null;
  const localArmor = numberIfPresent(flag, "localArmorBonus");
  if (localArmor !== null) return localArmor;
  const armorBonus = numberIfPresent(flag, "armorBonus");
  if (armorBonus !== null) {
    return armorBonus + numberOr(flag.enhancementBonus, 0);
  }
  return null;
}

function nativeSlotLocalArmorValue(item) {
  const piecemeal = explicitFlagArmorValue(getFlagData(item, FLAGS.piecemeal));
  if (piecemeal !== null) return piecemeal;
  const helmet = explicitFlagArmorValue(getFlagData(item, FLAGS.helmet));
  if (helmet !== null) return helmet;

  const armorBonus = numberOr(getProperty(item, "system.armor.value"), 0);
  const armorAlt = numberOr(getProperty(item, "system.armor.ac"), 0) || numberOr(getProperty(item, "system.armor.bonus"), 0);
  const acValue = numberOr(getProperty(item, "system.ac.value"), 0);
  const enhancement = numberOr(getProperty(item, "system.armor.enh"), 0);
  const total = Math.max(armorBonus, armorAlt, acValue) + enhancement;
  return total > 0 ? total : 0;
}

export function calledShotLocalArmorAggregationForLocation(locationOrPayload, aggregationMap = null) {
  const value = (() => {
    try {
      return globalThis.game?.settings?.get?.(MODULE_ID, SETTINGS.calledShotLocalArmorAggregation);
    } catch (_error) {
      return null;
    }
  })();
  const globalMode = normalizeCalledShotLocalArmorAggregation(value);
  if (globalMode !== LOCAL_ARMOR_AGGREGATION_MODES.perLocation) return globalMode;
  const locationId = locationOrPayload && typeof locationOrPayload === "object"
    ? locationIdFromPayload(locationOrPayload)
    : normalizeCalledShotLocationId(locationOrPayload);
  const overrides = aggregationMap === null
    ? localArmorAggregationOverrides()
    : normalizeCalledShotLocalArmorAggregationMap(aggregationMap);
  return overrides[locationId] === LOCAL_ARMOR_AGGREGATION_MODES.highest
    ? LOCAL_ARMOR_AGGREGATION_MODES.highest
    : LOCAL_ARMOR_AGGREGATION_MODES.sum;
}

function localArmorAggregationMode(locationOrPayload = null) {
  return calledShotLocalArmorAggregationForLocation(locationOrPayload);
}

function aggregateLocalArmorSources(sources, mode = localArmorAggregationMode()) {
  if (mode === LOCAL_ARMOR_AGGREGATION_MODES.highest) {
    return sources.reduce((highest, source) => Math.max(highest, numberOr(source.value)), 0);
  }
  return sources.reduce((total, source) => total + numberOr(source.value), 0);
}

function dedupeLocalArmorSource(sources, source) {
  if (!source?.sourceKey) {
    sources.push(source);
    return;
  }
  const existingIndex = sources.findIndex((entry) => entry.sourceKey === source.sourceKey);
  if (existingIndex < 0) {
    sources.push(source);
    return;
  }
  if (numberOr(source.value) > numberOr(sources[existingIndex].value)) sources[existingIndex] = source;
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
  const slots = exposed.nativeSlotLabel ?? "mapped";
  const suffix = mode === LOCAL_ARMOR_MODES.display ? " (advisory)" : "";
  return `Called Shot Exposed ${label}: no ${slots} item (armor ${exposed.aggregateTotal} -> 0)${suffix}`;
}

function localArmorSourceName(localArmor, payload, mode) {
  const label = payload?.locationLabel ?? payload?.coverageSlot ?? localArmor.coverageSlot;
  const sourceLabel = localArmor.profileSourceLabel ?? "profile";
  const localLabel = localArmor.aggregation === LOCAL_ARMOR_AGGREGATION_MODES.highest
    ? "highest local source"
    : "local sources";
  const suffix = mode === LOCAL_ARMOR_MODES.display ? " (advisory)" : "";
  return `Called Shot Local Armor: ${label} (${sourceLabel} ${localArmor.aggregateTotal} -> ${localLabel} ${localArmor.localTotal})${suffix}`;
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

function resolveArmorProfileForLocalArmor(actor) {
  try {
    const resolution = resolveArmorProfile(actor);
    if (resolution?.status !== ARMOR_PROFILE_STATUS.needsPieceValues) return resolution;
  } catch (_error) {
    // Fall through to native/aggregate contribution inspection.
  }
  return null;
}

function localArmorContributionFromResolution(resolution) {
  if (!resolution?.pieces?.length) return null;
  const summary = resolution.summary ?? {};
  const total = numberOr(summary.armorBonus) + numberOr(summary.enhancementBonus);
  return total > 0 ? {
    total,
    source: resolution.status,
    armorBonus: numberOr(summary.armorBonus),
    enhancementBonus: numberOr(summary.enhancementBonus)
  } : null;
}

function collectPacsLocalArmorSources(resolution, protection) {
  if (!resolution?.pieces?.length || !protection?.pacs?.length) return [];
  const summary = resolution.summary ?? {};
  const categories = new Set(protection.pacs);
  const activePieces = Array.isArray(summary.activePieces) && summary.activePieces.length
    ? summary.activePieces
    : resolution.pieces;
  const sources = [];
  for (const piece of activePieces) {
    if (!categories.has(piece.pieceCategory)) continue;
    dedupeLocalArmorSource(sources, {
      sourceKey: `pacs:${piece.id ?? piece.pieceCategory ?? piece.name}`,
      type: "pacs",
      value: calculateArmorPieceLocalTotal(summary, piece),
      label: piece.sourceItemName ?? piece.name ?? PACS_CATEGORY_LABELS[piece.pieceCategory] ?? "PAcS piece",
      piece
    });
  }
  return sources;
}

function collectNativeLocalArmorSources(actor, protection) {
  if (!protection?.native?.length) return [];
  const sources = [];
  for (const item of activeNativeSlotItems(actor, protection.native)) {
    const slotKey = normalizeNativeSlotKey(item.system?.slot);
    dedupeLocalArmorSource(sources, {
      sourceKey: `native:${item.id ?? item._id ?? item.name ?? slotKey}`,
      type: "native",
      value: nativeSlotLocalArmorValue(item),
      label: item.name ?? NATIVE_SLOT_LABELS[slotKey] ?? slotKey,
      nativeSlot: slotKey,
      item
    });
  }
  return sources;
}

function calculateLocalArmorPieceAdjustment(actor, payload) {
  const coverageSlot = payload?.coverageSlot;
  const normalizedSlots = parseArmorCoverageSlots(coverageSlot);
  const protectionContext = calledShotLocalArmorProtectionForLocation(payload);
  const locationId = protectionContext.locationId;
  const protection = protectionContext.protection;
  if (!actor || !protection || !localArmorLocationEnabled(payload)) return null;

  const resolution = resolveArmorProfileForLocalArmor(actor);
  const armorContribution = localArmorContributionFromResolution(resolution) ?? calculateActiveArmorContribution(actor);
  if (!armorContribution?.total) return null;

  const aggregation = localArmorAggregationMode(payload);
  const sources = [];
  for (const source of collectPacsLocalArmorSources(resolution, protection)) dedupeLocalArmorSource(sources, source);
  for (const source of collectNativeLocalArmorSources(actor, protection)) dedupeLocalArmorSource(sources, source);
  if (!resolution?.pieces?.length && !sources.length && armorContribution.source === "nativeArmor") return null;
  const localTotal = aggregateLocalArmorSources(sources, aggregation);
  const aggregateTotal = armorContribution.total;
  const adjustment = localTotal - aggregateTotal;
  return {
    coverageSlot,
    normalizedSlot: normalizedSlots[0] ?? locationId,
    normalizedSlots,
    locationId,
    aggregateTotal,
    localTotal,
    adjustment,
    pieceCount: sources.length,
    source: "localArmor",
    aggregation,
    protection,
    profileSourceLabel: resolution ? profileSourceLabel(resolution) : (armorContribution.source === "nativeArmor" ? "armor" : "profile"),
    armorContribution,
    pieces: sources.filter((entry) => entry.type === "pacs").map((entry) => entry.piece),
    nativeItems: sources.filter((entry) => entry.type === "native").map((entry) => entry.item),
    sources
  };
}

function calculateExposedArmorAdjustment(actor, payload) {
  if (!settingEnabled(SETTINGS.enableCalledShots, true)) return null;
  const coverageSlot = payload?.coverageSlot;
  const normalizedSlots = parseArmorCoverageSlots(coverageSlot);
  const protectionContext = calledShotLocalArmorProtectionForLocation(payload);
  const locationId = protectionContext.locationId;
  if (!actor || (!normalizedSlots.length && !locationId)) return null;
  const isHeadLocation = ["head", "eye", "ear"].includes(locationId);
  const isHandLocation = locationId === "hand";
  if (isHeadLocation && !settingEnabled(SETTINGS.enableExposedHeadshots, false)) return null;
  if (isHandLocation && !settingEnabled(SETTINGS.enableExposedHandShots, false)) return null;
  if (!isHeadLocation && !isHandLocation) return null;
  const nativeSlots = protectionContext.nativeSlots ?? [];
  const occupyingItem = activeNativeSlotItems(actor, nativeSlots)[0] ?? null;
  if (occupyingItem) return null;
  const armorContribution = calculateActiveArmorContribution(actor);
  if (!armorContribution?.total) return null;
  return {
    coverageSlot,
    normalizedSlot: normalizedSlots[0] ?? locationId,
    normalizedSlots,
    locationId,
    aggregateTotal: armorContribution.total,
    localTotal: 0,
    adjustment: -armorContribution.total,
    pieceCount: 0,
    source: "exposed",
    nativeSlot: nativeSlots[0] ?? null,
    nativeSlots,
    nativeSlotLabel: nativeSlots.length
      ? nativeSlots.map((slot) => NATIVE_SLOT_LABELS[slot] ?? slot).join("/")
      : "mapped slots",
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
