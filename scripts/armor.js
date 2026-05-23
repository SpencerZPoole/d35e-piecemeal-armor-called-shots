import { AGGREGATE_ARMOR_NAME, ARMOR_SUBTYPE_WEIGHT, FLAGS, MODULE_ID } from "./constants.js";

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

export function isPiecemealArmorPiece(item) {
  const flag = getFlagData(item, FLAGS.piecemeal);
  return item?.type === "equipment" && flag?.enabled === true;
}

export function isAggregateArmorItem(item) {
  const flag = getFlagData(item, FLAGS.aggregate);
  return item?.type === "equipment" && flag?.isAggregate === true;
}

export function getPiecemealArmorPieces(source, { equippedOnly = true } = {}) {
  return getItems(source).filter((item) => {
    if (!isPiecemealArmorPiece(item)) return false;
    if (!equippedOnly) return true;
    return item.system?.equipped === true && item.system?.melded !== true && item.broken !== true;
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
      weight: summary.weight,
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
            equipmentSubtype: summary.equipmentSubtype
          }
        }
      }
    }
  };
}

export function buildNeutralizeUpdate(item) {
  const backup = getFlagData(item, FLAGS.nativeBackup);
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

  return {
    "system.armor.value": 0,
    "system.armor.enh": 0,
    "system.armor.dex": null,
    "system.armor.acp": 0,
    "system.spellFailure": 0,
    "system.slot": "slotless",
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
  return {
    "system.equipmentType": native.equipmentType,
    "system.equipmentSubtype": native.equipmentSubtype,
    "system.armor.value": native.armor?.value ?? 0,
    "system.armor.enh": native.armor?.enh ?? 0,
    "system.armor.dex": native.armor?.dex ?? null,
    "system.armor.acp": native.armor?.acp ?? 0,
    "system.spellFailure": native.spellFailure ?? 0,
    "system.slot": native.slot ?? "slotless"
  };
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

export async function syncArmorAggregate(actor, { dryRun = false, equippedOnly = true } = {}) {
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
    if (item) await item.update(update.update);
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
    await item.update(update);
    if (item.unsetFlag) await item.unsetFlag(MODULE_ID, FLAGS.nativeBackup);
  }

  const aggregate = getItems(actor).find(isAggregateArmorItem);
  if (aggregate) await actor.deleteEmbeddedDocuments("Item", [aggregate.id]);
  return updates;
}
