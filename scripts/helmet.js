import { FLAGS, MODULE_ID, SETTINGS } from "./constants.js";
import { armorCoverageOverlaps, parseArmorCoverageSlots, RAW_ARMOR_PIECE_CATALOG } from "./armor.js";

export const DEFAULT_HELMET_COVERAGE = "head; eyes; ears";
export const HELMET_SKILLS = Object.freeze({
  listen: "lis",
  spot: "spt"
});

export const HELMET_FAMILY_OPTIONS = Object.freeze([
  ["", "Manual / no family"],
  ["padded", "Padded"],
  ["leather", "Leather"],
  ["studded-leather", "Studded leather"],
  ["hide", "Hide"],
  ["chain", "Chain"],
  ["plate", "Plate"]
]);

function getFlagData(document, key) {
  return document?.getFlag?.(MODULE_ID, key) ?? document?.flags?.[MODULE_ID]?.[key] ?? null;
}

function getItems(source) {
  if (Array.isArray(source)) return source;
  if (source?.items?.contents) return source.items.contents;
  if (Array.isArray(source?.items)) return source.items;
  return [];
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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

function keyForFamily(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function actorFromUuid(uuid) {
  if (!uuid) return null;
  const doc = globalThis.fromUuidSync?.(uuid);
  if (doc?.actor) return doc.actor;
  if (doc) return doc;
  const actorId = String(uuid).startsWith("Actor.") ? String(uuid).slice("Actor.".length) : null;
  return actorId ? globalThis.game?.actors?.get?.(actorId) ?? null : null;
}

function torsoArmorBonusForFamily(family) {
  const normalized = keyForFamily(family);
  const torso = RAW_ARMOR_PIECE_CATALOG.find((entry) => entry.pieceCategory === "torso" && entry.armorFamily === normalized);
  return torso ? numberOr(torso.armorBonus, 0) : 0;
}

function inheritedHelmetArmor(cap, inheritedArmor) {
  const capValue = numberOr(cap, 0);
  const inheritedValue = numberOrNull(inheritedArmor);
  if (inheritedValue === null) return capValue;
  return Math.max(0, Math.min(capValue, inheritedValue));
}

export function getHelmetFlag(item) {
  return getFlagData(item, FLAGS.helmet) ?? {};
}

export function isHelmetHeadCoverageEnabled() {
  return settingEnabled(SETTINGS.enableHelmetHeadCoverage, false) === true;
}

export function isHelmetSkillPenaltyEnabled() {
  return settingEnabled(SETTINGS.enableHelmetSkillPenalties, false) === true;
}

export function isHeadCoverageTarget(coverageSlot) {
  return parseArmorCoverageSlots(coverageSlot).includes("head");
}

export function isConfiguredHelmet(item) {
  const flag = getHelmetFlag(item);
  return item?.type === "equipment" && flag.enabled === true;
}

export function isActiveHelmet(item) {
  return isConfiguredHelmet(item) &&
    item.system?.equipped === true &&
    item.system?.carried !== false &&
    item.system?.melded !== true &&
    item.system?.slot === "head";
}

export function readHelmetCoverage(item) {
  const flag = getHelmetFlag(item);
  return flag.coverageSlots ?? flag.coverageSlot ?? DEFAULT_HELMET_COVERAGE;
}

export function helmetCoversCalledShot(item, coverageSlot) {
  return armorCoverageOverlaps(readHelmetCoverage(item), coverageSlot);
}

export function calculateHelmetLocalArmor(item, { inheritedArmor = null } = {}) {
  const flag = getHelmetFlag(item);
  const custom = numberOrNull(flag.localArmorBonus);
  const cap = custom ?? torsoArmorBonusForFamily(flag.armorFamily ?? flag.family);
  const base = inheritedHelmetArmor(cap, inheritedArmor);
  return {
    id: item?.id ?? item?._id ?? null,
    name: item?.name ?? "Helmet",
    armorFamily: keyForFamily(flag.armorFamily ?? flag.family),
    coverageSlots: readHelmetCoverage(item),
    localArmorBonus: numberOr(base, 0),
    inheritedArmor: numberOrNull(inheritedArmor),
    cap: numberOr(cap, 0),
    custom: custom !== null
  };
}

export function findActiveHelmetCoverage(actor, coverageSlot, options = {}) {
  if (!isHelmetHeadCoverageEnabled() || !isHeadCoverageTarget(coverageSlot)) return null;
  const helmets = getItems(actor)
    .filter((item) => isActiveHelmet(item) && helmetCoversCalledShot(item, coverageSlot))
    .map((item) => calculateHelmetLocalArmor(item, options))
    .sort((a, b) => b.localArmorBonus - a.localArmorBonus);
  if (helmets.length > 1) {
    console.warn(`${MODULE_ID} | Multiple configured helmets are equipped in the Head slot; using the strongest local head armor value.`);
  }
  return helmets[0] ?? {
    id: null,
    name: "No configured helmet",
    armorFamily: "",
    coverageSlots: DEFAULT_HELMET_COVERAGE,
    localArmorBonus: 0,
    inheritedArmor: numberOrNull(options.inheritedArmor),
    cap: 0,
    custom: false
  };
}

export function getActiveHelmetSkillPenalty(actor, skillId) {
  if (!isHelmetSkillPenaltyEnabled()) return null;
  if (![HELMET_SKILLS.listen, HELMET_SKILLS.spot].includes(skillId)) return null;
  const helmets = getItems(actor)
    .filter(isActiveHelmet)
    .map((item) => {
      const flag = getHelmetFlag(item);
      const raw = skillId === HELMET_SKILLS.listen ? flag.listenPenalty : flag.spotPenalty;
      const penalty = -Math.abs(numberOr(raw, 0));
      return {
        id: item?.id ?? item?._id ?? null,
        name: item?.name ?? "Helmet",
        penalty
      };
    })
    .filter((entry) => entry.penalty !== 0)
    .sort((a, b) => a.penalty - b.penalty);
  if (helmets.length > 1) {
    console.warn(`${MODULE_ID} | Multiple configured helmets have skill penalties; using the largest penalty.`);
  }
  return helmets[0] ?? null;
}

export function applyHelmetSkillPenaltyToHookData(actor, skillId, hookData) {
  const penalty = getActiveHelmetSkillPenalty(actor, skillId);
  if (!penalty) return null;
  hookData.skillSourceDetails = Array.isArray(hookData.skillSourceDetails) ? hookData.skillSourceDetails : [];
  hookData.skillSourceDetails.push({
    name: `Helmet (${penalty.name})`,
    value: penalty.penalty
  });
  return penalty;
}

let skillPenaltyHookRegistered = false;

export function registerHelmetSkillPenaltyHook() {
  if (skillPenaltyHookRegistered || !globalThis.Hooks?.on) return false;
  Hooks.on("D35E.preRollSkill", (_skillName, hookData, rollData) => {
    const actor = actorFromUuid(rollData?.uuid);
    applyHelmetSkillPenaltyToHookData(actor, rollData?.skillId, hookData);
  });
  skillPenaltyHookRegistered = true;
  return true;
}
