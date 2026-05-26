import {
  ARMOR_WORKFLOW_MODES,
  FLAGS,
  INTERNAL_ARMOR_PROFILE_NAME,
  MAGIC_MODES,
  MODULE_ID,
  PACS_EQUIPMENT_SLOTS,
  PIECE_CATEGORIES,
  SETTINGS
} from "./constants.js";
import {
  buildAggregateItemData,
  buildArmorProfileSourceDetailRows,
  buildNeutralizeUpdate,
  buildRestoreUpdate,
  calculatePiecemealArmorFromPieces,
  getCurrentRulesMode,
  getFlagData,
  getItems,
  isAggregateArmorItem,
  isInternalArmorProfileItem,
  isPiecemealArmorPiece,
  normalizePieceCategory,
  RAW_ARMOR_PIECE_CATALOG,
  RAW_ARMOR_SUIT_CATALOG,
  readArmorPiece
} from "./armor.js";

export const ARMOR_PROFILE_STATUS = Object.freeze({
  nativeArmor: "nativeArmor",
  compositeProfile: "compositeProfile",
  needsPieceValues: "needsPieceValues",
  empty: "empty"
});

const CATEGORY_ORDER = [PIECE_CATEGORIES.torso, PIECE_CATEGORIES.arms, PIECE_CATEGORIES.legs];
const CATEGORY_LABELS = Object.freeze({
  [PIECE_CATEGORIES.torso]: "Torso",
  [PIECE_CATEGORIES.arms]: "Arms",
  [PIECE_CATEGORIES.legs]: "Legs"
});
const PACS_SLOT_TO_CATEGORY = Object.freeze(Object.fromEntries(
  Object.entries(PACS_EQUIPMENT_SLOTS).map(([category, slot]) => [slot, category])
));
const PACS_SLOT_LABEL_KEYS = Object.freeze({
  [PACS_EQUIPMENT_SLOTS[PIECE_CATEGORIES.torso]]: "PAcS: Torso",
  [PACS_EQUIPMENT_SLOTS[PIECE_CATEGORIES.arms]]: "PAcS: Arms",
  [PACS_EQUIPMENT_SLOTS[PIECE_CATEGORIES.legs]]: "PAcS: Legs"
});
const PROFILE_CATEGORY_LABELS = Object.freeze({
  [PIECE_CATEGORIES.torso]: "Torso",
  [PIECE_CATEGORIES.arms]: "Arms",
  [PIECE_CATEGORIES.legs]: "Legs"
});
const AC_SOURCE_DETAIL_PATHS = Object.freeze([
  "system.attributes.ac.normal.total",
  "system.attributes.ac.flatFooted.total"
]);

function keyForValue(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function getProperty(source, path) {
  if (!source || !path) return undefined;
  if (globalThis.foundry?.utils?.getProperty) return foundry.utils.getProperty(source, path);
  return path.split(".").reduce((current, key) => current?.[key], source);
}

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function firstTextValue(...values) {
  for (const value of values) {
    if (typeof value !== "string" && typeof value !== "number") continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function itemCollectionGet(items, id) {
  if (!id) return null;
  if (items?.get) return items.get(id) ?? null;
  return getItems({ items }).find((item) => item.id === id || item._id === id) ?? null;
}

export function categoryForPacsEquipmentSlot(slot) {
  return PACS_SLOT_TO_CATEGORY[slot] ?? "";
}

export function profileSlotForCategory(category) {
  const normalized = normalizePieceCategory(category);
  return normalized ? PACS_EQUIPMENT_SLOTS[normalized] ?? null : null;
}

export function isPacsEquipmentSlot(slot) {
  return Boolean(categoryForPacsEquipmentSlot(slot));
}

function getSourceDetailRows(actor, path) {
  if (!actor?.sourceDetails) return null;
  const rows = actor.sourceDetails[path];
  if (Array.isArray(rows)) return rows;
  if (rows === undefined) {
    actor.sourceDetails[path] = [];
    return actor.sourceDetails[path];
  }
  return null;
}

function isArmorProfileCarrierSourceDetail(row) {
  return String(row?.name ?? "").includes(INTERNAL_ARMOR_PROFILE_NAME);
}

function isArmorProfileBreakdownSourceDetail(row) {
  return row?.moduleId === MODULE_ID && row?.pacsArmorProfileBreakdown === true;
}

function removeArmorProfileSourceDetails(actor) {
  let removed = 0;
  for (const path of AC_SOURCE_DETAIL_PATHS) {
    const rows = getSourceDetailRows(actor, path);
    if (!rows) continue;
    const filtered = rows.filter((row) => !isArmorProfileBreakdownSourceDetail(row) && !isArmorProfileCarrierSourceDetail(row));
    removed += rows.length - filtered.length;
    actor.sourceDetails[path] = filtered;
  }
  return removed;
}

function toSourceDetailRow(row) {
  return {
    name: row.name,
    value: row.value,
    bonusType: "armor",
    isItemBonus: true,
    moduleId: MODULE_ID,
    pacsArmorProfileBreakdown: true,
    pacsSource: row.source,
    pieceCategory: row.pieceCategory ?? null,
    pieceId: row.pieceId ?? null
  };
}

export function decorateArmorProfileSourceDetails(actor, resolution = null) {
  if (!actor?.sourceDetails) return { decorated: false, reason: "noSourceDetails" };
  const resolved = resolution ?? resolveArmorProfile(actor);
  if (resolved.profile?.suspended || resolved.status !== ARMOR_PROFILE_STATUS.compositeProfile || !resolved.carrier) {
    const removed = removeArmorProfileSourceDetails(actor);
    return { decorated: false, reason: "noCompositeProfile", removed };
  }

  const profileRows = buildArmorProfileSourceDetailRows(resolved.summary);
  if (!profileRows.length) {
    const removed = removeArmorProfileSourceDetails(actor);
    return { decorated: false, reason: "noRows", removed };
  }

  const detailRows = profileRows.map(toSourceDetailRow);
  const decoratedPaths = [];
  let removedCarrierRows = 0;
  for (const path of AC_SOURCE_DETAIL_PATHS) {
    const rows = getSourceDetailRows(actor, path);
    if (!rows) continue;
    const filtered = rows.filter((row) => {
      const remove = isArmorProfileBreakdownSourceDetail(row) || isArmorProfileCarrierSourceDetail(row);
      if (remove && isArmorProfileCarrierSourceDetail(row)) removedCarrierRows += 1;
      return !remove;
    });
    actor.sourceDetails[path] = [...filtered, ...detailRows];
    decoratedPaths.push(path);
  }

  return {
    decorated: decoratedPaths.length > 0,
    paths: decoratedPaths,
    rows: profileRows,
    removedCarrierRows
  };
}

export function registerPacsEquipmentSlots() {
  const d35eConfig = globalThis.CONFIG?.D35E;
  if (!d35eConfig) return false;

  const defaultCapacities = d35eConfig.defaultSlotCapacities ?? {};
  const nextCapacities = {};
  let inserted = false;
  for (const [key, value] of Object.entries(defaultCapacities)) {
    if (Object.values(PACS_EQUIPMENT_SLOTS).includes(key)) continue;
    nextCapacities[key] = value;
    if (key !== "armor") continue;
    for (const slot of Object.values(PACS_EQUIPMENT_SLOTS)) nextCapacities[slot] = 1;
    inserted = true;
  }
  if (!inserted) {
    for (const slot of Object.values(PACS_EQUIPMENT_SLOTS)) nextCapacities[slot] = 1;
  }
  d35eConfig.defaultSlotCapacities = nextCapacities;
  d35eConfig.equipmentSlots = d35eConfig.equipmentSlots ?? {};
  d35eConfig.equipmentSlots.misc = {
    ...(d35eConfig.equipmentSlots.misc ?? {}),
    ...PACS_SLOT_LABEL_KEYS
  };
  return true;
}

export function getArmorWorkflowMode() {
  return ARMOR_WORKFLOW_MODES.nativeProfile;
}

export function isArmorAutomationEnabled() {
  try {
    return game.settings.get(MODULE_ID, SETTINGS.enableArmor) !== false;
  } catch (_error) {
    return true;
  }
}

export function readArmorProfile(actor) {
  const flag = getFlagData(actor, FLAGS.armorProfile) ?? {};
  const flagSlots = flag.slots ?? {};
  const slots = {
    [PIECE_CATEGORIES.torso]: Object.hasOwn(flagSlots, PIECE_CATEGORIES.torso) ? flagSlots[PIECE_CATEGORIES.torso] || null : null,
    [PIECE_CATEGORIES.arms]: Object.hasOwn(flagSlots, PIECE_CATEGORIES.arms) ? flagSlots[PIECE_CATEGORIES.arms] || null : null,
    [PIECE_CATEGORIES.legs]: Object.hasOwn(flagSlots, PIECE_CATEGORIES.legs) ? flagSlots[PIECE_CATEGORIES.legs] || null : null
  };
  for (const item of getItems(actor)) {
    const category = item?.system?.equipped === true ? categoryForPacsEquipmentSlot(item.system?.slot) : "";
    if (!category || slots[category]) continue;
    if (Object.hasOwn(flagSlots, category)) continue;
    if (!isArmorProfileSourceItem(item)) continue;
    slots[category] = item.id ?? item._id ?? null;
  }
  return {
    version: 2,
    baselineItemId: flag.baselineItemId || null,
    slots,
    updatedAt: flag.updatedAt ?? null,
    suspended: flag.suspended === true
  };
}

function hasExplicitProfile(profile) {
  return Boolean(profile.baselineItemId || Object.values(profile.slots).some(Boolean));
}

export function reconcileArmorProfile(actor, profile = readArmorProfile(actor)) {
  const items = actor?.items ?? [];
  const nextProfile = {
    ...profile,
    slots: {
      [PIECE_CATEGORIES.torso]: profile?.slots?.[PIECE_CATEGORIES.torso] || null,
      [PIECE_CATEGORIES.arms]: profile?.slots?.[PIECE_CATEGORIES.arms] || null,
      [PIECE_CATEGORIES.legs]: profile?.slots?.[PIECE_CATEGORIES.legs] || null
    }
  };
  const prunedSlots = [];
  let prunedBaseline = null;

  if (nextProfile.baselineItemId && !itemCollectionGet(items, nextProfile.baselineItemId)) {
    prunedBaseline = nextProfile.baselineItemId;
    nextProfile.baselineItemId = null;
  }

  for (const category of CATEGORY_ORDER) {
    const itemId = nextProfile.slots[category];
    if (!itemId || itemCollectionGet(items, itemId)) continue;
    prunedSlots.push({ category, itemId });
    nextProfile.slots[category] = null;
  }

  return {
    profile: nextProfile,
    changed: Boolean(prunedBaseline || prunedSlots.length),
    prunedBaseline,
    prunedSlots
  };
}

function findProfileCarrier(actor) {
  return getItems(actor).find((item) => isInternalArmorProfileItem(item)) ??
    getItems(actor).find((item) => isAggregateArmorItem(item) && getFlagData(item, FLAGS.aggregate)?.internal === true) ??
    null;
}

export function findVisibleLegacyAggregate(actor) {
  return getItems(actor).find((item) => isAggregateArmorItem(item) && !isInternalArmorProfileItem(item)) ?? null;
}

function isNativeArmorItem(item) {
  return item?.type === "equipment" &&
    item.system?.equipmentType === "armor" &&
    !item.system?.melded &&
    !item.broken &&
    !categoryForPacsEquipmentSlot(item.system?.slot) &&
    !isAggregateArmorItem(item) &&
    !isInternalArmorProfileItem(item);
}

function isArmorProfileCatalogSourceItem(item) {
  const native = getFlagData(item, FLAGS.nativeBackup)?.native ?? null;
  return item?.type === "equipment" &&
    (item.system?.equipmentType === "armor" || native?.equipmentType === "armor") &&
    !item.system?.melded &&
    !item.broken &&
    !isAggregateArmorItem(item) &&
    !isInternalArmorProfileItem(item);
}

function isArmorProfileSourceItem(item) {
  return isPiecemealArmorPiece(item) || isArmorProfileCatalogSourceItem(item);
}

function profileSlotItemIds(profile) {
  return new Set(Object.values(profile?.slots ?? {}).filter(Boolean));
}

function findEquippedNativeBaselines(actor, excludedItemIds = new Set()) {
  return getItems(actor).filter((item) =>
    isNativeArmorItem(item) &&
    item.system?.equipped === true &&
    !isPiecemealArmorPiece(item) &&
    !excludedItemIds.has(item.id ?? item._id)
  );
}

function pieceCatalogEntry(id) {
  return RAW_ARMOR_PIECE_CATALOG.find((entry) => entry.id === id) ?? null;
}

function suitCatalogMatch(item) {
  if (!item) return null;
  const flag = getFlagData(item, FLAGS.piecemeal) ?? {};
  const family = keyForValue(flag.armorFamily || flag.family || "");
  if (family) {
    const byFamily = RAW_ARMOR_SUIT_CATALOG.find((entry) => entry.id === family);
    if (byFamily) return byFamily;
  }

  const name = keyForValue(item.name);
  return [...RAW_ARMOR_SUIT_CATALOG]
    .sort((a, b) => Math.max(...b.labels.map((label) => keyForValue(label).length)) - Math.max(...a.labels.map((label) => keyForValue(label).length)))
    .find((entry) => entry.labels.some((label) => name === keyForValue(label) || name.includes(keyForValue(label)))) ?? null;
}

function pieceFromCatalog(entry, item, category, { sourceKind = "profile", fullBaselineSuit = false } = {}) {
  const system = item?.system ?? {};
  const native = getFlagData(item, FLAGS.nativeBackup)?.native ?? {};
  const enhancementBonus = Number(native.armor?.enh ?? getProperty(system, "armor.enh") ?? 0) || 0;
  const material = keyForValue(firstTextValue(
    getProperty(native, "material.type"),
    getProperty(native, "material"),
    getProperty(system, "material.type"),
    getProperty(system, "material")
  ));
  const masterwork = native.masterwork === true || system.masterwork === true || enhancementBonus > 0 || ["mithral", "adamantine"].includes(material);
  return {
    ...cloneData(entry),
    id: `${item?.id ?? item?._id ?? "catalog"}:${entry.id}:${category}`,
    name: `${item?.name ?? entry.label} (${CATEGORY_LABELS[category]})`,
    sourceItemId: item?.id ?? item?._id ?? null,
    sourceItemName: item?.name ?? entry.label,
    sourceKind,
    inheritedFromBaseline: sourceKind === "baseline",
    material: material || entry.material || "",
    masterwork,
    enhancementBonus,
    magicMode: enhancementBonus > 0
      ? fullBaselineSuit ? MAGIC_MODES.suit : MAGIC_MODES.separatePiece
      : MAGIC_MODES.none,
    suitId: enhancementBonus > 0 && fullBaselineSuit ? `baseline-${item?.id ?? item?._id ?? keyForValue(item?.name)}` : ""
  };
}

function catalogPiecesForItem(item, sourceKind = "baseline") {
  const suit = suitCatalogMatch(item);
  if (!suit) return { piecesByCategory: new Map(), unresolved: true, suit: null };
  const fullBaselineSuit = Object.keys(suit.pieceIds).length === CATEGORY_ORDER.length;
  const piecesByCategory = new Map();
  for (const category of CATEGORY_ORDER) {
    const entry = pieceCatalogEntry(suit.pieceIds[category]);
    if (entry) piecesByCategory.set(category, pieceFromCatalog(entry, item, category, { sourceKind, fullBaselineSuit }));
  }
  return { piecesByCategory, unresolved: false, suit };
}

function pieceFromItemForCategory(item, category) {
  if (!item) return { piece: null, unresolved: false };
  if (isPiecemealArmorPiece(item)) {
    const piece = readArmorPiece(item);
    const pieceCategory = normalizePieceCategory(piece.pieceCategory);
    if (!pieceCategory || pieceCategory === category) {
      return {
        piece: {
          ...piece,
          id: `${item.id ?? item._id}:${category}`,
          pieceCategory: category,
          sourceItemId: item.id ?? item._id ?? null,
          sourceItemName: item.name,
          sourceKind: "override"
        },
        unresolved: false
      };
    }
  }

  if (!isArmorProfileCatalogSourceItem(item)) return { piece: null, unresolved: true };

  const { piecesByCategory, unresolved } = catalogPiecesForItem(item, "override");
  return {
    piece: piecesByCategory.get(category) ?? null,
    unresolved
  };
}

function sourceItemIdsForPieces(pieces) {
  return [...new Set(pieces.map((piece) => piece.sourceItemId).filter(Boolean))];
}

function sourceRolesForPieces(pieces) {
  const roles = new Map();
  for (const piece of pieces) {
    if (!piece.sourceItemId) continue;
    const current = roles.get(piece.sourceItemId) ?? {
      sourceItemId: piece.sourceItemId,
      itemName: piece.sourceItemName ?? piece.name,
      role: piece.sourceKind === "baseline" ? "baseline" : "override",
      categories: []
    };
    if (piece.sourceKind !== "baseline") current.role = "override";
    if (!current.categories.includes(piece.pieceCategory)) current.categories.push(piece.pieceCategory);
    roles.set(piece.sourceItemId, current);
  }
  return roles;
}

function chooseBaselineItem(actor, profile, hasOverrides, unresolved, warnings) {
  const items = actor?.items ?? [];
  const profileBaseline = itemCollectionGet(items, profile.baselineItemId);
  const assignedProfileItems = profileSlotItemIds(profile);
  if (profileBaseline && !assignedProfileItems.has(profileBaseline.id ?? profileBaseline._id) && !isPiecemealArmorPiece(profileBaseline)) return profileBaseline;

  if (hasOverrides) return null;

  const candidates = findEquippedNativeBaselines(actor, assignedProfileItems);
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    const note = {
      category: "baseline",
      reason: "multipleNativeArmor",
      itemNames: candidates.map((item) => item.name)
    };
    if (hasOverrides) unresolved.push(note);
    else warnings.push(note);
    return null;
  }
  return null;
}

export function resolveArmorProfile(actor, options = {}) {
  const reconciliation = reconcileArmorProfile(actor, options.profile ?? readArmorProfile(actor));
  const profile = reconciliation.profile;
  const items = actor?.items ?? [];
  const explicitProfile = hasExplicitProfile(profile);
  const hasOverrides = Object.values(profile.slots).some(Boolean);
  const unresolved = [];
  const warnings = [];
  const baselineItem = chooseBaselineItem(actor, profile, hasOverrides, unresolved, warnings);
  const baselineCatalog = baselineItem && !isPiecemealArmorPiece(baselineItem) && isArmorProfileCatalogSourceItem(baselineItem)
    ? catalogPiecesForItem(baselineItem, "baseline")
    : { piecesByCategory: new Map(), unresolved: false, suit: null };
  const resolved = [];
  const slotItems = {};

  for (const category of CATEGORY_ORDER) {
    const overrideId = profile.slots[category];
    const overrideItem = itemCollectionGet(items, overrideId);
    slotItems[category] = overrideItem;
    if (overrideId && !overrideItem) {
      unresolved.push({ category, itemId: overrideId, reason: "missingItem" });
      continue;
    }
    if (overrideItem) {
      const { piece, unresolved: unresolvedOverride } = pieceFromItemForCategory(overrideItem, category);
      if (piece) resolved.push(piece);
      else if (unresolvedOverride) unresolved.push({ category, itemId: overrideId, itemName: overrideItem.name, reason: "unknownArmor" });
      continue;
    }
    const baselinePiece = baselineCatalog.piecesByCategory.get(category);
    if (baselinePiece) resolved.push(baselinePiece);
  }

  if (explicitProfile && baselineItem && baselineCatalog.unresolved) {
    unresolved.push({ category: "baseline", itemId: baselineItem.id, itemName: baselineItem.name, reason: "unknownBaseline" });
  } else if (explicitProfile && baselineItem && !isPiecemealArmorPiece(baselineItem) && !isArmorProfileCatalogSourceItem(baselineItem)) {
    unresolved.push({ category: "baseline", itemId: baselineItem.id, itemName: baselineItem.name, reason: "notArmor" });
  }

  const sourceItemIds = sourceItemIdsForPieces(resolved);
  const sourceRoles = sourceRolesForPieces(resolved);
  const summary = calculatePiecemealArmorFromPieces(resolved, { rulesMode: options.rulesMode ?? getCurrentRulesMode(options) });
  summary.sourceItemIds = sourceItemIds;

  const status = unresolved.length
    ? ARMOR_PROFILE_STATUS.needsPieceValues
    : resolved.length === 0
      ? ARMOR_PROFILE_STATUS.empty
      : hasOverrides
        ? ARMOR_PROFILE_STATUS.compositeProfile
        : ARMOR_PROFILE_STATUS.nativeArmor;

  return {
    actorId: actor?.id ?? null,
    profile,
    explicitProfile,
    baselineItem,
    baselineSuit: baselineCatalog.suit,
    slotItems,
    pieces: resolved,
    unresolved,
    warnings,
    sourceItemIds,
    sourceRoles,
    summary,
    status,
    reconciliation,
    carrier: findProfileCarrier(actor),
    visibleLegacyAggregate: findVisibleLegacyAggregate(actor)
  };
}

async function setActorArmorProfile(actor, profile) {
  const next = {
    ...profile,
    version: 2,
    updatedAt: new Date().toISOString()
  };
  if (actor?.setFlag) return actor.setFlag(MODULE_ID, FLAGS.armorProfile, next);
  actor.flags = actor.flags ?? {};
  actor.flags[MODULE_ID] = actor.flags[MODULE_ID] ?? {};
  actor.flags[MODULE_ID][FLAGS.armorProfile] = next;
  return next;
}

async function unsetActorArmorProfile(actor) {
  if (actor?.unsetFlag) return actor.unsetFlag(MODULE_ID, FLAGS.armorProfile);
  if (actor?.flags?.[MODULE_ID]) delete actor.flags[MODULE_ID][FLAGS.armorProfile];
  return true;
}

async function restoreBackedUpItems(actor) {
  const restored = [];
  for (const item of getItems(actor)) {
    const update = buildRestoreUpdate(item);
    if (!update) continue;
    restored.push({ itemId: item.id, itemName: item.name, update });
    if (item.update) await item.update(update, { _slotBypass: true, d35ePacsProfile: true });
    if (item.unsetFlag) {
      await item.unsetFlag(MODULE_ID, FLAGS.nativeBackup);
      await item.unsetFlag(MODULE_ID, FLAGS.armorProfile);
    }
  }
  return restored;
}

async function deleteArmorProfileCarriers(actor) {
  const deleted = [];
  for (const item of [...getItems(actor)]) {
    if (!isInternalArmorProfileItem(item) && !isAggregateArmorItem(item)) continue;
    deleted.push({ itemId: item.id, itemName: item.name });
    await deleteItemIfPresent(actor, item);
  }
  return deleted;
}

async function zeroArmorProfileCarriers(actor) {
  const zeroed = [];
  for (const item of getItems(actor)) {
    if (!isInternalArmorProfileItem(item) && !isAggregateArmorItem(item)) continue;
    const update = {
      "system.equipped": false,
      "system.armor.value": 0,
      "system.armor.enh": 0,
      "system.armor.dex": null,
      "system.armor.acp": 0,
      "system.armor.spellFailure": 0,
      "system.spellFailure": 0,
      "system.weight": 0,
      [`flags.${MODULE_ID}.${FLAGS.internalArmor}.suspended`]: true
    };
    zeroed.push({ itemId: item.id, itemName: item.name, update });
    await item.update?.(update, { _slotBypass: true, d35ePacsProfile: true });
  }
  return zeroed;
}

async function unequipSuspendedOverrideItems(actor, profile) {
  const unequipped = [];
  const baselineId = profile?.baselineItemId || null;
  for (const itemId of Object.values(profile?.slots ?? {}).filter(Boolean)) {
    if (itemId === baselineId) continue;
    const item = itemCollectionGet(actor?.items ?? [], itemId);
    if (!item?.update || item.system?.equipped !== true) continue;
    await item.update({ "system.equipped": false }, { _slotBypass: true, d35ePacsProfile: true });
    unequipped.push({ itemId, itemName: item.name });
  }
  return unequipped;
}

async function unequipNativeArmorOutsideProfile(actor, sourceItemIds = []) {
  const sourceIds = new Set(sourceItemIds);
  const unequipped = [];
  for (const item of getItems(actor)) {
    const itemId = item?.id ?? item?._id;
    if (!item?.update || !itemId || sourceIds.has(itemId)) continue;
    if (!isNativeArmorItem(item) || item.system?.equipped !== true) continue;
    const update = { "system.equipped": false };
    if (item.system?.slot === "armor") update["system.slot"] = "slotless";
    unequipped.push({ itemId, itemName: item.name, update });
    await item.update(update, { _slotBypass: true, d35ePacsProfile: true });
  }
  return unequipped;
}

async function deleteItemIfPresent(actor, item) {
  if (!actor || !item?.id) return false;
  if (actor.deleteEmbeddedDocuments) {
    try {
      await actor.deleteEmbeddedDocuments("Item", [item.id], { d35ePacsProfile: true });
      return true;
    } catch (error) {
      const message = String(error?.message ?? error);
      if (/does not exist|EmbeddedCollection/i.test(message)) return false;
      throw error;
    }
  }
  const items = getItems(actor);
  const index = items.findIndex((entry) => entry.id === item.id);
  if (index >= 0) items.splice(index, 1);
  return index >= 0;
}

async function ensureEquipped(item) {
  if (!item?.update || item.system?.equipped === true) return;
  await item.update({ "system.equipped": true }, { _slotBypass: true, d35ePacsProfile: true });
}

async function refreshActorArmorMath(actor) {
  if (!actor) return;
  // D35E refreshes actor math for normal equip toggles, but our profile updates
  // also rewrite armor values and hidden carrier data without a user equip click.
  if (actor.refresh) {
    await actor.refresh({ d35ePacsProfile: true });
    decorateArmorProfileSourceDetails(actor);
    return;
  }
  await actor.update?.({}, { d35ePacsProfile: true });
  decorateArmorProfileSourceDetails(actor);
}

async function ensureNativeBaselineEquipped(actor, resolution) {
  const baselineId = resolution.profile.baselineItemId ?? resolution.baselineItem?.id ?? resolution.baselineItem?._id;
  const baseline = itemCollectionGet(actor.items, baselineId);
  if (!baseline?.update || isPiecemealArmorPiece(baseline)) return null;
  const update = {};
  if (baseline.system?.equipmentType !== "armor") update["system.equipmentType"] = "armor";
  if (baseline.system?.equipped !== true) update["system.equipped"] = true;
  if (Object.keys(update).length) await baseline.update(update, { _slotBypass: true, d35ePacsProfile: true });
  return baseline;
}

async function restoreItemsOutsideProfile(actor, sourceItemIds) {
  const restored = [];
  const activeSources = new Set(sourceItemIds);
  for (const item of getItems(actor)) {
    if (activeSources.has(item.id ?? item._id)) continue;
    const update = buildRestoreUpdate(item);
    if (!update) continue;
    restored.push({ itemId: item.id, itemName: item.name, update });
    if (item.update) await item.update(update, { _slotBypass: true, d35ePacsProfile: true });
    if (item.unsetFlag) {
      await item.unsetFlag(MODULE_ID, FLAGS.nativeBackup);
      await item.unsetFlag(MODULE_ID, FLAGS.armorProfile);
    }
  }
  return restored;
}

function buildProfileCarrierData(resolution) {
  const data = buildAggregateItemData(resolution.summary, { internal: true });
  data.name = INTERNAL_ARMOR_PROFILE_NAME;
  data.system.description = {
    value: "Internal D35E armor carrier generated from the actor's PAcS inventory slots. It is hidden from normal inventory UI."
  };
  data.flags[MODULE_ID][FLAGS.internalArmor] = {
    isInternal: true,
    sourceItemIds: resolution.sourceItemIds,
    status: resolution.status,
    suspended: false,
    generatedAt: new Date().toISOString()
  };
  data.flags[MODULE_ID][FLAGS.aggregate].componentIds = resolution.sourceItemIds;
  data.flags[MODULE_ID][FLAGS.aggregate].summary.sourceItemIds = resolution.sourceItemIds;
  return data;
}

async function upsertProfileCarrier(actor, resolution) {
  const data = buildProfileCarrierData(resolution);
  const carrier = findProfileCarrier(actor);
  if (carrier?.update) {
    await carrier.update(data, { _slotBypass: true, d35ePacsProfile: true });
    await ensureEquipped(carrier);
    return carrier;
  }
  if (actor?.createEmbeddedDocuments) {
    const created = await actor.createEmbeddedDocuments("Item", [data], { _slotBypass: true, d35ePacsProfile: true });
    await ensureEquipped(created?.[0]);
    return created?.[0] ?? null;
  }
  const items = getItems(actor);
  data.id = data.id ?? `pacs-profile-${Date.now().toString(36)}`;
  items.push(data);
  return data;
}

async function persistArmorProfileReconciliation(actor) {
  const reconciliation = reconcileArmorProfile(actor);
  if (reconciliation.changed) await setActorArmorProfile(actor, reconciliation.profile);
  return reconciliation;
}

export async function migrateLegacyArmorProfile(actor, { dryRun = false } = {}) {
  const visibleAggregate = findVisibleLegacyAggregate(actor);
  const oldPieces = getItems(actor).filter(isPiecemealArmorPiece);
  const hasBackups = getItems(actor).some((item) => getFlagData(item, FLAGS.nativeBackup));
  if (!visibleAggregate && !oldPieces.length && !hasBackups) return { migrated: false };

  const slots = {
    [PIECE_CATEGORIES.torso]: null,
    [PIECE_CATEGORIES.arms]: null,
    [PIECE_CATEGORIES.legs]: null
  };
  for (const item of oldPieces) {
    const category = normalizePieceCategory(readArmorPiece(item).pieceCategory);
    if (slots[category] == null) slots[category] = item.id ?? item._id ?? null;
  }
  const nextProfile = {
    version: 2,
    baselineItemId: null,
    slots
  };
  if (dryRun) return { migrated: true, profile: nextProfile, visibleAggregateId: visibleAggregate?.id ?? null };

  await restoreBackedUpItems(actor);
  if (visibleAggregate) await deleteItemIfPresent(actor, visibleAggregate);
  await setActorArmorProfile(actor, nextProfile);
  return { migrated: true, profile: nextProfile, visibleAggregateId: visibleAggregate?.id ?? null };
}

export async function setArmorProfileBaseline(actor, itemId) {
  const profile = readArmorProfile(actor);
  const previousBaselineId = profile.baselineItemId || null;
  profile.baselineItemId = itemId || null;
  if (itemId) {
    for (const category of CATEGORY_ORDER) {
      if (profile.slots[category] === itemId) profile.slots[category] = null;
    }
  } else if (previousBaselineId) {
    const previousBaseline = itemCollectionGet(actor?.items ?? [], previousBaselineId);
    const backup = previousBaseline ? getFlagData(previousBaseline, FLAGS.nativeBackup) : null;
    if (backup?.native) {
      const native = {
        ...backup.native,
        equipped: false,
        slot: "slotless"
      };
      await previousBaseline.update?.({
        [`flags.${MODULE_ID}.${FLAGS.nativeBackup}.native`]: native
      }, { _slotBypass: true, d35ePacsProfile: true });
    }
  }
  await setActorArmorProfile(actor, profile);
  return applyArmorProfile(actor, { migrateLegacy: false });
}

export async function setArmorProfileSlot(actor, category, itemId) {
  const normalized = normalizePieceCategory(category);
  if (!normalized) throw new Error(`Unknown armor profile category: ${category}`);
  const profile = readArmorProfile(actor);
  if (itemId) {
    const item = itemCollectionGet(actor?.items ?? [], itemId);
    if (item && isPiecemealArmorPiece(item)) {
      const piece = readArmorPiece(item);
      const explicitCategory = normalizePieceCategory(piece.pieceCategory);
      if (explicitCategory && explicitCategory !== normalized) {
        throw new Error(`${item.name ?? "This item"} is a ${PROFILE_CATEGORY_LABELS[explicitCategory] ?? explicitCategory} armor piece. Drop it on PAcS: ${PROFILE_CATEGORY_LABELS[explicitCategory] ?? explicitCategory}.`);
      }
    }
    if (profile.baselineItemId === itemId) {
      profile.baselineItemId = null;
    } else if (!profile.baselineItemId) {
      const excludedItemIds = profileSlotItemIds(profile);
      excludedItemIds.add(itemId);
      const candidates = findEquippedNativeBaselines(actor, excludedItemIds);
      if (candidates.length === 1) profile.baselineItemId = candidates[0].id ?? candidates[0]._id ?? null;
    }
    for (const existingCategory of CATEGORY_ORDER) {
      if (existingCategory !== normalized && profile.slots[existingCategory] === itemId) profile.slots[existingCategory] = null;
    }
  }
  profile.slots[normalized] = itemId || null;
  await setActorArmorProfile(actor, profile);
  return applyArmorProfile(actor, { migrateLegacy: false });
}

export async function clearArmorProfile(actor) {
  const restored = await restoreBackedUpItems(actor);
  const deletedCarriers = await deleteArmorProfileCarriers(actor);
  await unsetActorArmorProfile(actor);
  return { restored, deletedCarriers, cleared: true };
}

export async function suspendArmorProfileAutomation(actor) {
  if (!actor) throw new Error("suspendArmorProfileAutomation requires an actor.");
  const profile = readArmorProfile(actor);
  const restored = await restoreBackedUpItems(actor);
  const unequippedOverrides = await unequipSuspendedOverrideItems(actor, profile);
  const zeroedCarriers = await zeroArmorProfileCarriers(actor);
  if (hasExplicitProfile(profile)) {
    await setActorArmorProfile(actor, { ...profile, suspended: true });
  }
  await refreshActorArmorMath(actor);
  return {
    suspended: true,
    restored,
    unequippedOverrides,
    zeroedCarriers,
    deletedCarriers: [],
    profile
  };
}

export async function resumeArmorProfileAutomation(actor) {
  if (!actor) throw new Error("resumeArmorProfileAutomation requires an actor.");
  const profile = readArmorProfile(actor);
  if (!hasExplicitProfile(profile)) return { resumed: false, reason: "noProfile" };
  await setActorArmorProfile(actor, { ...profile, suspended: false });
  return applyArmorProfile(actor, { migrateLegacy: false });
}

export async function applyArmorProfile(actor, { migrateLegacy = true } = {}) {
  if (!actor) throw new Error("applyArmorProfile requires an actor.");
  if (!isArmorAutomationEnabled()) {
    return suspendArmorProfileAutomation(actor);
  }
  if (migrateLegacy && !hasExplicitProfile(readArmorProfile(actor))) {
    await migrateLegacyArmorProfile(actor);
  }

  const reconciliation = await persistArmorProfileReconciliation(actor);
  const resolution = resolveArmorProfile(actor, { profile: reconciliation.profile });
  if (resolution.status === ARMOR_PROFILE_STATUS.needsPieceValues) {
    const restored = await restoreBackedUpItems(actor);
    const carrier = findProfileCarrier(actor);
    if (carrier) await deleteItemIfPresent(actor, carrier);
    await refreshActorArmorMath(actor);
    return {
      ...resolution,
      skipped: true,
      reason: "needsPieceValues",
      restored,
      reconciliation,
      carrierId: null
    };
  }

  if (resolution.status === ARMOR_PROFILE_STATUS.nativeArmor || resolution.status === ARMOR_PROFILE_STATUS.empty) {
    const restored = await restoreBackedUpItems(actor);
    if (resolution.status === ARMOR_PROFILE_STATUS.nativeArmor) await ensureNativeBaselineEquipped(actor, resolution);
    const zeroedCarriers = await zeroArmorProfileCarriers(actor);
    await refreshActorArmorMath(actor);
    return {
      ...resolution,
      restored,
      zeroedCarriers,
      reconciliation,
      carrierId: null
    };
  }

  const restored = await restoreItemsOutsideProfile(actor, resolution.sourceItemIds);
  const unequippedNativeArmor = await unequipNativeArmorOutsideProfile(actor, resolution.sourceItemIds);
  for (const sourceId of resolution.sourceItemIds) {
    const item = itemCollectionGet(actor.items, sourceId);
    if (!item) continue;
    const role = resolution.sourceRoles.get(sourceId) ?? { role: "source", categories: [] };
    const primaryCategory = role.categories[0] ?? null;
    const update = buildNeutralizeUpdate(item, {
      profileRole: role.role,
      profileSlot: role.role === "override" ? profileSlotForCategory(primaryCategory) : null
    });
    update[`flags.${MODULE_ID}.${FLAGS.armorProfile}`] = {
      role: "source",
      sourceRole: role.role,
      category: primaryCategory,
      profileSlot: role.role === "override" ? profileSlotForCategory(primaryCategory) : null,
      profileAppliedAt: new Date().toISOString()
    };
    await item.update?.(update, { _slotBypass: true, d35ePacsProfile: true });
  }
  if (resolution.visibleLegacyAggregate) await deleteItemIfPresent(actor, resolution.visibleLegacyAggregate);
  const carrier = await upsertProfileCarrier(actor, resolution);
  await refreshActorArmorMath(actor);
  return {
    ...resolution,
    restored,
    unequippedNativeArmor,
    reconciliation,
    carrierId: carrier?.id ?? null
  };
}

export function armorProfileStatusLabel(status) {
  return {
    [ARMOR_PROFILE_STATUS.nativeArmor]: "Native armor",
    [ARMOR_PROFILE_STATUS.compositeProfile]: "Composite profile",
    [ARMOR_PROFILE_STATUS.needsPieceValues]: "Needs piece values",
    [ARMOR_PROFILE_STATUS.empty]: "No armor profile"
  }[status] ?? "Armor profile";
}

function shouldRefreshProfileForItem(item) {
  if (!item?.parent || item.type !== "equipment") return false;
  if (isInternalArmorProfileItem(item) || isAggregateArmorItem(item)) return true;
  if (getFlagData(item, FLAGS.nativeBackup) || getFlagData(item, FLAGS.armorProfile)?.role === "source") return true;
  const actorProfile = readArmorProfile(item.parent);
  if (hasExplicitProfile(actorProfile)) return true;
  return isNativeArmorItem(item) && item.system?.equipped === true;
}

function scheduleProfileApply(actor) {
  if (!actor || !isArmorAutomationEnabled() || getArmorWorkflowMode() !== ARMOR_WORKFLOW_MODES.nativeProfile) return;
  globalThis.window?.setTimeout?.(() => {
    const actors = globalThis.game?.actors;
    if (actor.id && actors?.has?.(actor.id) === false) return;
    applyArmorProfile(actor, { migrateLegacy: false }).catch((error) => {
      console.error(`${MODULE_ID} | Failed to refresh piecemeal armor profile.`, error);
    });
  }, 100);
}

export function registerArmorProfileHooks() {
  if (!globalThis.Hooks?.on) return;
  Hooks.on("updateActor", (actor) => {
    decorateArmorProfileSourceDetails(actor);
  });
  Hooks.on("createItem", (item, options = {}) => {
    if (options.d35ePacsProfile || !shouldRefreshProfileForItem(item)) return;
    scheduleProfileApply(item.parent);
  });
  Hooks.on("updateItem", (item, _updateData, options = {}) => {
    if (options.d35ePacsProfile || !shouldRefreshProfileForItem(item)) return;
    scheduleProfileApply(item.parent);
  });
  Hooks.on("deleteItem", (item, options = {}) => {
    const actor = item?.parent ?? item?.actor ?? null;
    if (options.d35ePacsProfile || !actor) return;
    const profile = readArmorProfile(actor);
    const deletedItemId = item.id ?? item._id ?? null;
    const referencedByProfile = deletedItemId && (
      profile.baselineItemId === deletedItemId ||
      Object.values(profile.slots).includes(deletedItemId)
    );
    if (!referencedByProfile && !hasExplicitProfile(profile) && !isInternalArmorProfileItem(item) && !isAggregateArmorItem(item)) return;
    scheduleProfileApply(actor);
  });
}
