import { AGGREGATE_ARMOR_NAME, ARMOR_SUBTYPE_WEIGHT, FLAGS, MODULE_ID } from "./constants.js";

const COVERAGE_DELIMITER = /[,;|/\r\n]+/;
const MISC_VISUAL_SLOTS = new Set([
  "slotless",
  "head",
  "headband",
  "eyes",
  "shoulders",
  "neck",
  "chest",
  "body",
  "belt",
  "wrists",
  "hands",
  "ring",
  "feet"
]);

function getProperty(source, path) {
  if (!source || !path) return undefined;
  if (globalThis.foundry?.utils?.getProperty) return foundry.utils.getProperty(source, path);
  return path.split(".").reduce((current, key) => current?.[key], source);
}

function getFlagData(document, key) {
  return document?.getFlag?.(MODULE_ID, key) ?? document?.flags?.[MODULE_ID]?.[key] ?? null;
}

function numberOr(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getItems(source) {
  if (Array.isArray(source)) return source;
  if (source?.items?.contents) return source.items.contents;
  if (Array.isArray(source?.items)) return source.items;
  return [];
}

function keyForSlot(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function parseArmorCoverageTokens(value) {
  return [...new Set(String(value ?? "").split(COVERAGE_DELIMITER).map(keyForSlot).filter(Boolean))];
}

export function normalizeArmorSlot(value) {
  const key = keyForSlot(value);
  const aliases = {
    arm: "arms",
    arms: "arms",
    wing: "arms",
    wings: "arms",
    hand: "hands",
    hands: "hands",
    leg: "legs",
    legs: "legs",
    foot: "legs",
    feet: "legs",
    head: "head",
    face: "head",
    eye: "head",
    eyes: "head",
    ear: "head",
    ears: "head",
    torso: "torso",
    chest: "torso",
    body: "torso",
    vital: "torso",
    vitals: "torso",
    neck: "neck",
    throat: "neck"
  };
  return aliases[key] ?? key;
}

export function parseArmorCoverageSlots(value) {
  return [...new Set(parseArmorCoverageTokens(value).map(normalizeArmorSlot).filter(Boolean))];
}

export function armorCoverageOverlaps(first, second) {
  const firstSlots = new Set(parseArmorCoverageSlots(first));
  if (!firstSlots.size) return false;
  return parseArmorCoverageSlots(second).some((slot) => firstSlots.has(slot));
}

function visualSlotFromNativeSlot(slot) {
  const key = keyForSlot(slot);
  return MISC_VISUAL_SLOTS.has(key) ? key : null;
}

function visualSlotFromCoverage(coverage) {
  const tokens = parseArmorCoverageTokens(coverage);
  if (tokens.some((slot) => slot === "eye" || slot === "eyes")) return "eyes";
  if (tokens.some((slot) => slot === "neck" || slot === "throat")) return "neck";
  if (tokens.some((slot) => slot === "head" || slot === "face" || slot === "ear" || slot === "ears")) return "head";
  if (tokens.some((slot) => slot === "torso" || slot === "chest" || slot === "body" || slot === "vital" || slot === "vitals")) return "body";
  if (tokens.some((slot) => slot === "arm" || slot === "arms" || slot === "wing" || slot === "wings")) return "wrists";
  if (tokens.some((slot) => slot === "hand" || slot === "hands")) return "hands";
  if (tokens.some((slot) => slot === "leg" || slot === "legs" || slot === "foot" || slot === "feet")) return "feet";
  return null;
}

export function isPiecemealArmorPiece(item) {
  const flag = getFlagData(item, FLAGS.piecemeal);
  return item?.type === "equipment" && flag?.enabled === true;
}

export function isAggregateArmorItem(item) {
  const flag = getFlagData(item, FLAGS.aggregate);
  return item?.type === "equipment" && flag?.isAggregate === true;
}

export function getPiecemealArmorPieces(source, { equippedOnly = false } = {}) {
  return getItems(source).filter((item) => {
    if (!isPiecemealArmorPiece(item)) return false;
    if (item.system?.melded === true) return false;
    if (item.system?.carried === false) return false;
    if (item.broken === true || item.system?.broken === true) return false;
    if (equippedOnly && item.system?.equipped !== true) return false;
    return true;
  });
}

export function readArmorPiece(item) {
  const flag = getFlagData(item, FLAGS.piecemeal) ?? {};
  const system = item.system ?? {};
  return {
    id: item.id ?? item._id ?? item.name,
    name: item.name ?? "Unnamed armor piece",
    slot: flag.slot || flag.coverageSlot || "torso",
    armorBonus: numberOr(flag.armorBonus, numberOr(getProperty(system, "armor.value"), 0)),
    enhancementBonus: numberOr(flag.enhancementBonus, numberOr(getProperty(system, "armor.enh"), 0)),
    maxDex: nullableNumber(flag.maxDex ?? getProperty(system, "armor.dex")),
    acp: Math.abs(numberOr(flag.acp, numberOr(getProperty(system, "armor.acp"), 0))),
    spellFailure: numberOr(flag.spellFailure, numberOr(system.spellFailure, 0)),
    equipmentSubtype: flag.equipmentSubtype || system.equipmentSubtype || "lightArmor",
    weight: numberOr(flag.weight, numberOr(system.weight, 0)),
    sourceItem: item
  };
}

export function calculatePiecemealArmor(source, options = {}) {
  const pieces = getPiecemealArmorPieces(source, options).map(readArmorPiece);
  const maxDexValues = pieces.map((piece) => piece.maxDex).filter((value) => value !== null);
  const heaviestSubtype = pieces.reduce((current, piece) => {
    const currentWeight = ARMOR_SUBTYPE_WEIGHT[current] ?? 0;
    const pieceWeight = ARMOR_SUBTYPE_WEIGHT[piece.equipmentSubtype] ?? 0;
    return pieceWeight > currentWeight ? piece.equipmentSubtype : current;
  }, "lightArmor");

  return {
    pieces,
    componentIds: pieces.map((piece) => piece.id),
    armorBonus: pieces.reduce((total, piece) => total + piece.armorBonus, 0),
    enhancementBonus: pieces.reduce((total, piece) => total + piece.enhancementBonus, 0),
    maxDex: maxDexValues.length > 0 ? Math.min(...maxDexValues) : null,
    acp: pieces.reduce((total, piece) => total + piece.acp, 0),
    spellFailure: pieces.reduce((total, piece) => total + piece.spellFailure, 0),
    equipmentSubtype: heaviestSubtype,
    weight: pieces.reduce((total, piece) => total + piece.weight, 0)
  };
}

export function buildAggregateItemData(summary) {
  return {
    name: AGGREGATE_ARMOR_NAME,
    type: "equipment",
    system: {
      equipped: true,
      equipmentType: "armor",
      equipmentSubtype: summary.equipmentSubtype,
      armor: {
        value: summary.armorBonus,
        enh: summary.enhancementBonus,
        dex: summary.maxDex,
        acp: summary.acp === 0 ? 0 : -Math.abs(summary.acp)
      },
      spellFailure: summary.spellFailure,
      slot: "armor",
      weight: 0,
      description: {
        value: "Module-generated aggregate item for equipped piecemeal armor pieces."
      }
    },
    flags: {
      [MODULE_ID]: {
        [FLAGS.aggregate]: {
          isAggregate: true,
          componentIds: summary.componentIds,
          generatedAt: new Date().toISOString(),
          summary: {
            armorBonus: summary.armorBonus,
            enhancementBonus: summary.enhancementBonus,
            maxDex: summary.maxDex,
            acp: summary.acp,
            spellFailure: summary.spellFailure,
            equipmentSubtype: summary.equipmentSubtype,
            weight: summary.weight
          }
        }
      }
    }
  };
}

function buildNativeSnapshot(item) {
  const native = {
    equipmentType: item.system?.equipmentType ?? "armor",
    equipmentSubtype: item.system?.equipmentSubtype ?? "lightArmor",
    armor: {
      value: getProperty(item.system, "armor.value") ?? 0,
      enh: getProperty(item.system, "armor.enh") ?? 0,
      dex: getProperty(item.system, "armor.dex") ?? null,
      acp: getProperty(item.system, "armor.acp") ?? 0
    },
    spellFailure: item.system?.spellFailure ?? 0,
    slot: item.system?.slot ?? "slotless"
  };
  if (typeof item.system?.equipped === "boolean") native.equipped = item.system.equipped;
  return native;
}

export function inferSyncedComponentVisualSlot(item) {
  const backup = getFlagData(item, FLAGS.nativeBackup);
  const native = backup?.native ?? buildNativeSnapshot(item);
  const flag = getFlagData(item, FLAGS.piecemeal) ?? {};
  return visualSlotFromNativeSlot(native.slot) ??
    visualSlotFromNativeSlot(item.system?.slot) ??
    visualSlotFromCoverage(flag.slot || flag.coverageSlot) ??
    "slotless";
}

export function buildNeutralizeUpdate(item) {
  const backup = getFlagData(item, FLAGS.nativeBackup);
  const native = backup?.native ?? buildNativeSnapshot(item);

  return {
    "system.equipped": true,
    "system.equipmentType": "misc",
    "system.equipmentSubtype": "clothing",
    "system.armor.value": 0,
    "system.armor.enh": 0,
    "system.armor.dex": null,
    "system.armor.acp": 0,
    "system.spellFailure": 0,
    "system.slot": inferSyncedComponentVisualSlot(item),
    [`flags.${MODULE_ID}.${FLAGS.nativeBackup}`]: backup ?? {
      backedUpAt: new Date().toISOString(),
      native
    }
  };
}

export function buildRestoreUpdate(item) {
  const backup = getFlagData(item, FLAGS.nativeBackup);
  const native = backup?.native;
  if (!native) return null;
  const update = {
    "system.equipmentType": native.equipmentType,
    "system.equipmentSubtype": native.equipmentSubtype,
    "system.armor.value": native.armor?.value ?? 0,
    "system.armor.enh": native.armor?.enh ?? 0,
    "system.armor.dex": native.armor?.dex ?? null,
    "system.armor.acp": native.armor?.acp ?? 0,
    "system.spellFailure": native.spellFailure ?? 0,
    "system.slot": native.slot ?? "slotless"
  };
  if (typeof native.equipped === "boolean") update["system.equipped"] = native.equipped;
  return update;
}

export function previewArmorSync(actor, options = {}) {
  const summary = calculatePiecemealArmor(actor, options);
  const pieces = getPiecemealArmorPieces(actor, options);
  const aggregate = getItems(actor).find(isAggregateArmorItem) ?? null;
  return {
    actorId: actor?.id ?? null,
    summary,
    aggregateId: aggregate?.id ?? null,
    aggregateData: buildAggregateItemData(summary),
    componentUpdates: pieces.map((item) => ({
      itemId: item.id,
      itemName: item.name,
      update: buildNeutralizeUpdate(item)
    }))
  };
}

async function ensureEquipped(item) {
  if (!item?.update || item.system?.equipped === true) return;
  await item.update({ "system.equipped": true }, { _slotBypass: true });
}

export async function syncArmorAggregate(actor, { dryRun = false, equippedOnly = false } = {}) {
  if (!actor) throw new Error("syncArmorAggregate requires an actor.");
  const plan = previewArmorSync(actor, { equippedOnly });
  if (dryRun) return plan;
  if (plan.summary.pieces.length === 0) {
    return {
      ...plan,
      skipped: true,
      reason: "noPieces"
    };
  }

  for (const update of plan.componentUpdates) {
    const item = actor.items?.get?.(update.itemId);
    if (item) await item.update(update.update, { _slotBypass: true });
  }

  const aggregate = actor.items?.find?.(isAggregateArmorItem);
  if (aggregate) {
    await aggregate.update(plan.aggregateData);
    await ensureEquipped(aggregate);
  } else {
    const created = await actor.createEmbeddedDocuments("Item", [plan.aggregateData], { _slotBypass: true });
    await ensureEquipped(created?.[0]);
  }
  return plan;
}

export async function restoreArmorComponents(actor) {
  if (!actor) throw new Error("restoreArmorComponents requires an actor.");
  const updates = [];
  for (const item of getItems(actor)) {
    const update = buildRestoreUpdate(item);
    if (!update) continue;
    updates.push({ itemId: item.id, itemName: item.name, update });
    await item.update(update, { _slotBypass: true });
    if (item.unsetFlag) await item.unsetFlag(MODULE_ID, FLAGS.nativeBackup);
  }

  const aggregate = getItems(actor).find(isAggregateArmorItem);
  if (aggregate) await actor.deleteEmbeddedDocuments("Item", [aggregate.id]);
  return updates;
}
