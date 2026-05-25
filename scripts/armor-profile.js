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
  [PACS_EQUIPMENT_SLOTS[PIECE_CATEGORIES.torso]]: "D35E.EquipSlotPacsTorso",
  [PACS_EQUIPMENT_SLOTS[PIECE_CATEGORIES.arms]]: "D35E.EquipSlotPacsArms",
  [PACS_EQUIPMENT_SLOTS[PIECE_CATEGORIES.legs]]: "D35E.EquipSlotPacsLegs"
});

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
  try {
    const value = game.settings.get(MODULE_ID, SETTINGS.armorWorkflowMode);
    return Object.values(ARMOR_WORKFLOW_MODES).includes(value) ? value : ARMOR_WORKFLOW_MODES.nativeProfile;
  } catch (_error) {
    return ARMOR_WORKFLOW_MODES.nativeProfile;
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
    if (isAggregateArmorItem(item) || isInternalArmorProfileItem(item)) continue;
    slots[category] = item.id ?? item._id ?? null;
  }
  return {
    version: 2,
    baselineItemId: flag.baselineItemId || null,
    slots,
    updatedAt: flag.updatedAt ?? null
  };
}

function hasExplicitProfile(profile) {
  return Boolean(profile.baselineItemId || Object.values(profile.slots).some(Boolean));
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
  const enhancementBonus = Number(getProperty(system, "armor.enh") ?? 0) || 0;
  const material = keyForValue(getProperty(system, "material.type") || getProperty(system, "material") || "");
  const masterwork = system.masterwork === true || enhancementBonus > 0 || ["mithral", "adamantine"].includes(material);
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
  const candidates = findEquippedNativeBaselines(actor, assignedProfileItems);
  if (profileBaseline && !assignedProfileItems.has(profileBaseline.id ?? profileBaseline._id) && candidates.some((item) => item.id === profileBaseline.id || item._id === profileBaseline._id)) return profileBaseline;
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
  if (profileBaseline && !assignedProfileItems.has(profileBaseline.id ?? profileBaseline._id) && !isPiecemealArmorPiece(profileBaseline)) return profileBaseline;
  return null;
}

export function resolveArmorProfile(actor, options = {}) {
  const profile = readArmorProfile(actor);
  const items = actor?.items ?? [];
  const explicitProfile = hasExplicitProfile(profile);
  const hasOverrides = Object.values(profile.slots).some(Boolean);
  const unresolved = [];
  const warnings = [];
  const baselineItem = chooseBaselineItem(actor, profile, hasOverrides, unresolved, warnings);
  const baselineCatalog = baselineItem && !isPiecemealArmorPiece(baselineItem)
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
    if (item.unsetFlag) await item.unsetFlag(MODULE_ID, FLAGS.nativeBackup);
  }
  return restored;
}

async function deleteItemIfPresent(actor, item) {
  if (!actor || !item?.id) return false;
  if (actor.deleteEmbeddedDocuments) {
    await actor.deleteEmbeddedDocuments("Item", [item.id]);
    return true;
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
    return;
  }
  await actor.update?.({}, { d35ePacsProfile: true });
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
  profile.baselineItemId = itemId || null;
  await setActorArmorProfile(actor, profile);
  return applyArmorProfile(actor, { migrateLegacy: false });
}

export async function setArmorProfileSlot(actor, category, itemId) {
  const normalized = normalizePieceCategory(category);
  if (!normalized) throw new Error(`Unknown armor profile category: ${category}`);
  const profile = readArmorProfile(actor);
  if (itemId) {
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
  const carrier = findProfileCarrier(actor);
  if (carrier) await deleteItemIfPresent(actor, carrier);
  const legacy = findVisibleLegacyAggregate(actor);
  if (legacy) await deleteItemIfPresent(actor, legacy);
  await unsetActorArmorProfile(actor);
  return { restored, cleared: true };
}

export async function applyArmorProfile(actor, { migrateLegacy = true } = {}) {
  if (!actor) throw new Error("applyArmorProfile requires an actor.");
  if (getArmorWorkflowMode() === ARMOR_WORKFLOW_MODES.legacyAggregate) {
    return { skipped: true, reason: "legacyWorkflowMode" };
  }
  if (migrateLegacy && !hasExplicitProfile(readArmorProfile(actor))) {
    await migrateLegacyArmorProfile(actor);
  }

  const resolution = resolveArmorProfile(actor);
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
      carrierId: null
    };
  }

  if (resolution.status === ARMOR_PROFILE_STATUS.nativeArmor || resolution.status === ARMOR_PROFILE_STATUS.empty) {
    const restored = await restoreBackedUpItems(actor);
    if (resolution.status === ARMOR_PROFILE_STATUS.nativeArmor) await ensureNativeBaselineEquipped(actor, resolution);
    const carrier = findProfileCarrier(actor);
    if (carrier) await deleteItemIfPresent(actor, carrier);
    await refreshActorArmorMath(actor);
    return {
      ...resolution,
      restored,
      carrierId: null
    };
  }

  const restored = await restoreItemsOutsideProfile(actor, resolution.sourceItemIds);
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
  if (!actor || getArmorWorkflowMode() !== ARMOR_WORKFLOW_MODES.nativeProfile) return;
  globalThis.window?.setTimeout?.(() => {
    applyArmorProfile(actor, { migrateLegacy: false }).catch((error) => {
      console.error(`${MODULE_ID} | Failed to refresh piecemeal armor profile.`, error);
    });
  }, 100);
}

export function registerArmorProfileHooks() {
  if (!globalThis.Hooks?.on) return;
  Hooks.on("createItem", (item, options = {}) => {
    if (options.d35ePacsProfile || !shouldRefreshProfileForItem(item)) return;
    scheduleProfileApply(item.parent);
  });
  Hooks.on("updateItem", (item, _updateData, options = {}) => {
    if (options.d35ePacsProfile || !shouldRefreshProfileForItem(item)) return;
    scheduleProfileApply(item.parent);
  });
  Hooks.on("deleteItem", (item, options = {}) => {
    if (options.d35ePacsProfile || !item?.parent) return;
    const profile = readArmorProfile(item.parent);
    if (!hasExplicitProfile(profile) && !isInternalArmorProfileItem(item) && !isAggregateArmorItem(item)) return;
    scheduleProfileApply(item.parent);
  });
}
