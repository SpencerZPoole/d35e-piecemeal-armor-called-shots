import {
  AGGREGATE_ARMOR_NAME,
  ARMOR_SUBTYPE_WEIGHT,
  DON_STATES,
  FLAGS,
  INTERNAL_ARMOR_PROFILE_NAME,
  MAGIC_MODES,
  MODULE_ID,
  PACS_EQUIPMENT_SLOTS,
  PIECE_CATEGORIES,
  RULES_MODES,
  SETTINGS
} from "./constants.js";

const COVERAGE_DELIMITER = /[,;|/\r\n]+/;
const CATEGORY_ORDER = [PIECE_CATEGORIES.torso, PIECE_CATEGORIES.legs, PIECE_CATEGORIES.arms];
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
  "feet",
  PACS_EQUIPMENT_SLOTS[PIECE_CATEGORIES.torso],
  PACS_EQUIPMENT_SLOTS[PIECE_CATEGORIES.arms],
  PACS_EQUIPMENT_SLOTS[PIECE_CATEGORIES.legs]
]);

export const RAW_ARMOR_PIECE_CATALOG = Object.freeze([
  { id: "padded-arms", label: "Padded arm armor", pieceCategory: "arms", coverageSlots: "arms; hands", armorFamily: "padded", equipmentSubtype: "lightArmor", armorBonus: 0, maxDex: 8, acp: 0, spellFailure: 5, weight: 2, cost: 1 },
  { id: "leather-arms", label: "Leather arm armor", pieceCategory: "arms", coverageSlots: "arms; hands", armorFamily: "leather", equipmentSubtype: "lightArmor", armorBonus: 0, maxDex: 6, acp: 0, spellFailure: 10, weight: 2, cost: 2 },
  { id: "studded-leather-arms", label: "Studded leather arm armor", pieceCategory: "arms", coverageSlots: "arms; hands", armorFamily: "studded-leather", equipmentSubtype: "lightArmor", armorBonus: 0, maxDex: 5, acp: 0, spellFailure: 15, weight: 2, cost: 5 },
  { id: "hide-arms", label: "Hide arm armor", pieceCategory: "arms", coverageSlots: "arms; hands", armorFamily: "hide", equipmentSubtype: "mediumArmor", armorBonus: 0, maxDex: 4, acp: 2, spellFailure: 20, weight: 3, cost: 2 },
  { id: "chain-arms", label: "Chain arm armor", pieceCategory: "arms", coverageSlots: "arms; hands", armorFamily: "chain", equipmentSubtype: "mediumArmor", armorBonus: 1, maxDex: 2, acp: 3, spellFailure: 30, weight: 5, cost: 25 },
  { id: "plate-arms", label: "Plate arm armor", pieceCategory: "arms", coverageSlots: "arms; hands", armorFamily: "plate", equipmentSubtype: "heavyArmor", armorBonus: 1, maxDex: 1, acp: 7, spellFailure: 35, weight: 10, cost: 375 },
  { id: "padded-legs", label: "Padded leg armor", pieceCategory: "legs", coverageSlots: "legs; feet", armorFamily: "padded", equipmentSubtype: "lightArmor", armorBonus: 0, maxDex: 8, acp: 0, spellFailure: 0, weight: 3, cost: 1 },
  { id: "leather-legs", label: "Leather leg armor", pieceCategory: "legs", coverageSlots: "legs; feet", armorFamily: "leather", equipmentSubtype: "lightArmor", armorBonus: 0, maxDex: 6, acp: 0, spellFailure: 0, weight: 3, cost: 3 },
  { id: "studded-leather-legs", label: "Studded leather leg armor", pieceCategory: "legs", coverageSlots: "legs; feet", armorFamily: "studded-leather", equipmentSubtype: "lightArmor", armorBonus: 1, maxDex: 5, acp: 0, spellFailure: 10, weight: 3, cost: 5 },
  { id: "hide-legs", label: "Hide leg armor", pieceCategory: "legs", coverageSlots: "legs; feet", armorFamily: "hide", equipmentSubtype: "mediumArmor", armorBonus: 1, maxDex: 4, acp: 2, spellFailure: 10, weight: 7, cost: 3 },
  { id: "chain-legs", label: "Chain leg armor", pieceCategory: "legs", coverageSlots: "legs; feet", armorFamily: "chain", equipmentSubtype: "mediumArmor", armorBonus: 0, maxDex: 2, acp: 2, spellFailure: 15, weight: 10, cost: 25 },
  { id: "plate-legs", label: "Plate leg armor", pieceCategory: "legs", coverageSlots: "legs; feet", armorFamily: "plate", equipmentSubtype: "heavyArmor", armorBonus: 1, maxDex: 1, acp: 3, spellFailure: 20, weight: 10, cost: 925 },
  { id: "padded-torso", label: "Padded torso armor", pieceCategory: "torso", coverageSlots: "torso; chest; vitals; heart; head", armorFamily: "padded", equipmentSubtype: "lightArmor", armorBonus: 0, maxDex: 8, acp: 0, spellFailure: 5, weight: 5, cost: 3 },
  { id: "leather-torso", label: "Leather torso armor", pieceCategory: "torso", coverageSlots: "torso; chest; vitals; heart; head", armorFamily: "leather", equipmentSubtype: "lightArmor", armorBonus: 1, maxDex: 6, acp: 0, spellFailure: 10, weight: 10, cost: 5 },
  { id: "studded-leather-torso", label: "Studded leather torso armor", pieceCategory: "torso", coverageSlots: "torso; chest; vitals; heart; head", armorFamily: "studded-leather", equipmentSubtype: "lightArmor", armorBonus: 1, maxDex: 5, acp: 0, spellFailure: 15, weight: 15, cost: 15 },
  { id: "hide-torso", label: "Hide torso armor", pieceCategory: "torso", coverageSlots: "torso; chest; vitals; heart; head", armorFamily: "hide", equipmentSubtype: "mediumArmor", armorBonus: 2, maxDex: 4, acp: 2, spellFailure: 20, weight: 15, cost: 10 },
  { id: "chain-torso", label: "Chain torso armor", pieceCategory: "torso", coverageSlots: "torso; chest; vitals; heart; head", armorFamily: "chain", equipmentSubtype: "mediumArmor", armorBonus: 4, maxDex: 4, acp: 2, spellFailure: 30, weight: 25, cost: 100 },
  { id: "plate-torso", label: "Plate torso armor", pieceCategory: "torso", coverageSlots: "torso; chest; vitals; heart; head", armorFamily: "plate", equipmentSubtype: "heavyArmor", armorBonus: 6, maxDex: 3, acp: 4, spellFailure: 35, weight: 30, cost: 200 }
]);

export const RAW_ARMOR_SUIT_CATALOG = Object.freeze([
  { id: "padded", labels: ["padded", "padded armor"], pieceIds: { torso: "padded-torso", legs: "padded-legs", arms: "padded-arms" } },
  { id: "leather", labels: ["leather", "leather armor"], pieceIds: { torso: "leather-torso", legs: "leather-legs", arms: "leather-arms" } },
  { id: "studded-leather", labels: ["studded leather", "studded leather armor"], pieceIds: { torso: "studded-leather-torso", legs: "studded-leather-legs", arms: "studded-leather-arms" } },
  { id: "hide", labels: ["hide", "hide armor"], pieceIds: { torso: "hide-torso", legs: "hide-legs", arms: "hide-arms" } },
  { id: "chain", labels: ["chainmail", "chain mail", "chain armor"], pieceIds: { torso: "chain-torso", legs: "chain-legs", arms: "chain-arms" } },
  { id: "chain-shirt", labels: ["chain shirt"], pieceIds: { torso: "chain-torso" } },
  { id: "breastplate", labels: ["breastplate", "agile breastplate"], pieceIds: { torso: "plate-torso" } },
  { id: "half-plate", labels: ["half-plate", "half plate"], pieceIds: { torso: "plate-torso", legs: "chain-legs", arms: "plate-arms" } },
  { id: "full-plate", labels: ["full plate", "full-plate"], pieceIds: { torso: "plate-torso", legs: "plate-legs", arms: "plate-arms" } }
]);

function getProperty(source, path) {
  if (!source || !path) return undefined;
  if (globalThis.foundry?.utils?.getProperty) return foundry.utils.getProperty(source, path);
  return path.split(".").reduce((current, key) => current?.[key], source);
}

export function getFlagData(document, key) {
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

function boolOr(value, fallback = false) {
  if (value === true || value === "true" || value === "on" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  return fallback;
}

export function getItems(source) {
  if (Array.isArray(source)) return source;
  if (source?.items?.contents) return source.items.contents;
  if (Array.isArray(source?.items)) return source.items;
  return [];
}

function keyForSlot(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function firstNonBlank(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined && String(value).trim() !== "") return value;
  }
  return "";
}

export function normalizeRulesMode(value) {
  return Object.values(RULES_MODES).includes(value) ? value : RULES_MODES.rawAdapted;
}

export function getCurrentRulesMode(options = {}) {
  if (options.rulesMode) return normalizeRulesMode(options.rulesMode);
  try {
    return normalizeRulesMode(game.settings.get(MODULE_ID, SETTINGS.rulesMode));
  } catch (_error) {
    return RULES_MODES.rawAdapted;
  }
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
    heart: "torso",
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

export function normalizePieceCategory(value) {
  const key = normalizeArmorSlot(value);
  if (key === PIECE_CATEGORIES.arms || key === PIECE_CATEGORIES.legs || key === PIECE_CATEGORIES.torso) return key;
  if (key === "hands") return PIECE_CATEGORIES.arms;
  if (key === "head" || key === "neck") return PIECE_CATEGORIES.torso;
  return "";
}

export function inferPieceCategoryFromCoverage(coverage) {
  const slots = parseArmorCoverageSlots(coverage);
  if (slots.includes(PIECE_CATEGORIES.torso) || slots.includes("head") || slots.includes("neck")) return PIECE_CATEGORIES.torso;
  if (slots.includes(PIECE_CATEGORIES.legs)) return PIECE_CATEGORIES.legs;
  if (slots.includes(PIECE_CATEGORIES.arms) || slots.includes("hands")) return PIECE_CATEGORIES.arms;
  return PIECE_CATEGORIES.torso;
}

function visualSlotFromNativeSlot(slot) {
  const key = keyForSlot(slot);
  return MISC_VISUAL_SLOTS.has(key) ? key : null;
}

function visualSlotFromCoverage(coverage) {
  const tokens = parseArmorCoverageTokens(coverage);
  if (tokens.some((slot) => slot === "eye" || slot === "eyes")) return "eyes";
  if (tokens.some((slot) => slot === "neck" || slot === "throat")) return "neck";
  if (tokens.some((slot) => slot === "torso" || slot === "chest" || slot === "body" || slot === "vital" || slot === "vitals" || slot === "heart")) return "body";
  if (tokens.some((slot) => slot === "head" || slot === "face" || slot === "ear" || slot === "ears")) return "head";
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

export function isInternalArmorProfileItem(item) {
  const flag = getFlagData(item, FLAGS.internalArmor);
  return item?.type === "equipment" && flag?.isInternal === true;
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
  const coverageSlots = firstNonBlank(flag.coverageSlots, flag.coverageSlot, flag.slot, "torso");
  const pieceCategory = normalizePieceCategory(flag.pieceCategory) || inferPieceCategoryFromCoverage(coverageSlots);
  const enhancementBonus = numberOr(flag.enhancementBonus, numberOr(getProperty(system, "armor.enh"), 0));
  const material = keyForSlot(flag.material || getProperty(system, "material.type") || getProperty(system, "material") || "");
  const magicMode = Object.values(MAGIC_MODES).includes(flag.magicMode)
    ? flag.magicMode
    : enhancementBonus > 0
      ? MAGIC_MODES.separatePiece
      : MAGIC_MODES.none;

  return {
    id: item.id ?? item._id ?? item.name,
    name: item.name ?? "Unnamed armor piece",
    slot: coverageSlots,
    coverageSlots,
    pieceCategory,
    armorFamily: keyForSlot(flag.armorFamily || flag.family || ""),
    material,
    masterwork: boolOr(flag.masterwork, boolOr(system.masterwork, enhancementBonus > 0 || material === "mithral" || material === "adamantine")),
    magicMode,
    suitId: keyForSlot(flag.suitId || ""),
    donState: Object.values(DON_STATES).includes(flag.donState) ? flag.donState : DON_STATES.normal,
    armorBonus: numberOr(flag.armorBonus, numberOr(getProperty(system, "armor.value"), 0)),
    enhancementBonus,
    maxDex: nullableNumber(flag.maxDex ?? getProperty(system, "armor.dex")),
    acp: Math.abs(numberOr(flag.acp, numberOr(getProperty(system, "armor.acp"), 0))),
    spellFailure: numberOr(flag.spellFailure, numberOr(system.spellFailure, 0)),
    equipmentSubtype: flag.equipmentSubtype || system.equipmentSubtype || "lightArmor",
    weight: numberOr(flag.weight, numberOr(system.weight, 0)),
    cost: numberOr(flag.cost, numberOr(system.price, 0)),
    sourceItem: item
  };
}

function pieceArmorBonus(piece) {
  const hastyPenalty = piece.donState === DON_STATES.hasty ? 1 : 0;
  return Math.max(0, numberOr(piece.armorBonus) - hastyPenalty);
}

function pieceAcp(piece) {
  const hastyPenalty = piece.donState === DON_STATES.hasty ? 1 : 0;
  return Math.max(0, numberOr(piece.acp) + hastyPenalty);
}

function pieceSpellFailure(piece) {
  return Math.max(0, numberOr(piece.spellFailure));
}

function heaviestSubtype(pieces) {
  return pieces.reduce((current, piece) => {
    const currentWeight = ARMOR_SUBTYPE_WEIGHT[current] ?? 0;
    const pieceWeight = ARMOR_SUBTYPE_WEIGHT[piece.equipmentSubtype] ?? 0;
    return pieceWeight > currentWeight ? piece.equipmentSubtype : current;
  }, "lightArmor");
}

function subtypeAfterMaterial(subtype, allMithral) {
  if (!allMithral) return subtype;
  if (subtype === "heavyArmor") return "mediumArmor";
  if (subtype === "mediumArmor") return "lightArmor";
  return subtype;
}

function bestRawPieceForCategory(existing, candidate) {
  if (!existing) return candidate;
  const candidateScore = pieceArmorBonus(candidate) + numberOr(candidate.enhancementBonus) + (ARMOR_SUBTYPE_WEIGHT[candidate.equipmentSubtype] ?? 0) / 10;
  const existingScore = pieceArmorBonus(existing) + numberOr(existing.enhancementBonus) + (ARMOR_SUBTYPE_WEIGHT[existing.equipmentSubtype] ?? 0) / 10;
  return candidateScore > existingScore ? candidate : existing;
}

function selectRawPieces(pieces) {
  const byCategory = new Map();
  for (const piece of pieces) {
    byCategory.set(piece.pieceCategory, bestRawPieceForCategory(byCategory.get(piece.pieceCategory), piece));
  }
  const selected = CATEGORY_ORDER.map((category) => byCategory.get(category)).filter(Boolean);
  const selectedIds = new Set(selected.map((piece) => piece.id));
  return {
    selected,
    ignored: pieces.filter((piece) => !selectedIds.has(piece.id))
  };
}

function completeSuit(pieces) {
  const categories = new Set(pieces.map((piece) => piece.pieceCategory));
  return CATEGORY_ORDER.every((category) => categories.has(category));
}

function mixedSuit(pieces, isCompleteSuit) {
  if (!isCompleteSuit) return false;
  const families = new Set(pieces.map((piece) => piece.armorFamily).filter(Boolean));
  return families.size > 1;
}

function materialSummary(pieces) {
  const materials = pieces.map((piece) => piece.material).filter(Boolean);
  const allSame = materials.length === pieces.length && new Set(materials).size === 1;
  const material = allSame ? materials[0] : "";
  return {
    allSame,
    material,
    allMithral: allSame && material === "mithral",
    allAdamantine: allSame && material === "adamantine",
    allDragonhide: allSame && material === "dragonhide"
  };
}

function mostProtectivePiece(pieces) {
  for (const category of CATEGORY_ORDER) {
    const piece = pieces.find((entry) => entry.pieceCategory === category);
    if (piece) return piece;
  }
  return pieces[0] ?? null;
}

function activeMagicSummary(pieces, isCompleteSuit) {
  const suitCandidates = pieces.filter((piece) => piece.magicMode === MAGIC_MODES.suit && piece.suitId);
  const suitIds = new Set(suitCandidates.map((piece) => piece.suitId));
  if (isCompleteSuit && suitCandidates.length === pieces.length && suitIds.size === 1) {
    const enhancementBonus = Math.max(0, ...suitCandidates.map((piece) => numberOr(piece.enhancementBonus)));
    return {
      mode: MAGIC_MODES.suit,
      suitId: [...suitIds][0],
      enhancementBonus,
      masterworkApplied: enhancementBonus > 0 || suitCandidates.some((piece) => piece.masterwork),
      appliedPieceId: null
    };
  }

  const protective = mostProtectivePiece(pieces);
  if (!protective) {
    return {
      mode: MAGIC_MODES.none,
      enhancementBonus: 0,
      masterworkApplied: false,
      appliedPieceId: null
    };
  }

  const contributes = protective.magicMode === MAGIC_MODES.separatePiece || protective.masterwork || protective.enhancementBonus > 0;
  return {
    mode: contributes ? MAGIC_MODES.separatePiece : MAGIC_MODES.none,
    enhancementBonus: contributes ? Math.max(0, numberOr(protective.enhancementBonus)) : 0,
    masterworkApplied: contributes && (protective.masterwork || protective.enhancementBonus > 0),
    appliedPieceId: contributes ? protective.id : null
  };
}

function calculateLegacySummary(pieces) {
  const maxDexValues = pieces.map((piece) => piece.maxDex).filter((value) => value !== null);
  return {
    rulesMode: RULES_MODES.legacyWorkflow,
    pieces,
    activePieces: pieces,
    ignoredPieces: [],
    componentIds: pieces.map((piece) => piece.id),
    armorBonus: pieces.reduce((total, piece) => total + piece.armorBonus, 0),
    enhancementBonus: pieces.reduce((total, piece) => total + piece.enhancementBonus, 0),
    maxDex: maxDexValues.length > 0 ? Math.min(...maxDexValues) : null,
    acp: pieces.reduce((total, piece) => total + piece.acp, 0),
    spellFailure: pieces.reduce((total, piece) => total + piece.spellFailure, 0),
    equipmentSubtype: heaviestSubtype(pieces),
    weight: pieces.reduce((total, piece) => total + piece.weight, 0),
    cost: pieces.reduce((total, piece) => total + piece.cost, 0),
    completeSuit: false,
    mixedSuit: false,
    suitArmorBonus: 0,
    mixedSuitSpellFailurePenalty: 0,
    magic: {
      mode: MAGIC_MODES.separatePiece,
      enhancementBonus: pieces.reduce((total, piece) => total + piece.enhancementBonus, 0),
      masterworkApplied: false,
      appliedPieceId: null
    },
    material: materialSummary(pieces),
    notes: []
  };
}

function calculateRawSummary(allPieces) {
  const { selected: pieces, ignored: ignoredPieces } = selectRawPieces(allPieces);
  const maxDexValues = pieces.map((piece) => piece.maxDex).filter((value) => value !== null);
  const isCompleteSuit = completeSuit(pieces);
  const isMixedSuit = mixedSuit(pieces, isCompleteSuit);
  const material = materialSummary(pieces);
  const magic = activeMagicSummary(pieces, isCompleteSuit);
  const suitArmorBonus = isCompleteSuit ? 1 : 0;
  const mixedSuitSpellFailurePenalty = isMixedSuit ? 5 : 0;
  const baseAcp = pieces.length ? Math.max(...pieces.map(pieceAcp)) : 0;
  const masterworkReduction = material.allMithral ? 3 : magic.masterworkApplied ? 1 : 0;
  const baseSpellFailure = pieces.length ? Math.max(...pieces.map(pieceSpellFailure)) : 0;
  const baseMaxDex = maxDexValues.length > 0 ? Math.min(...maxDexValues) : null;
  const rawSubtype = heaviestSubtype(pieces);
  const notes = [];

  if (ignoredPieces.length) {
    notes.push(`${ignoredPieces.length} duplicate piecemeal armor component(s) were ignored for RAW aggregate math.`);
  }
  if (material.allAdamantine) notes.push("Adamantine material benefits are recorded for GM reference; D35E damage reduction automation is not exact.");
  if (material.allDragonhide) notes.push("Dragonhide material benefits are recorded for GM reference; D35E energy-immunity automation is not exact.");

  return {
    rulesMode: RULES_MODES.rawAdapted,
    pieces: allPieces,
    activePieces: pieces,
    ignoredPieces,
    componentIds: pieces.map((piece) => piece.id),
    armorBonus: pieces.reduce((total, piece) => total + pieceArmorBonus(piece), 0) + suitArmorBonus,
    enhancementBonus: magic.enhancementBonus,
    maxDex: baseMaxDex === null ? null : baseMaxDex + (material.allMithral ? 2 : 0),
    acp: Math.max(0, baseAcp - masterworkReduction),
    spellFailure: Math.max(0, baseSpellFailure - (material.allMithral ? 10 : 0) + mixedSuitSpellFailurePenalty),
    equipmentSubtype: subtypeAfterMaterial(rawSubtype, material.allMithral),
    weight: pieces.reduce((total, piece) => total + piece.weight, 0),
    cost: pieces.reduce((total, piece) => total + piece.cost, 0),
    completeSuit: isCompleteSuit,
    mixedSuit: isMixedSuit,
    suitArmorBonus,
    mixedSuitSpellFailurePenalty,
    magic,
    material,
    notes
  };
}

export function calculatePiecemealArmorFromPieces(pieces, options = {}) {
  return getCurrentRulesMode(options) === RULES_MODES.legacyWorkflow
    ? calculateLegacySummary(pieces)
    : calculateRawSummary(pieces);
}

export function calculatePiecemealArmor(source, options = {}) {
  const pieces = getPiecemealArmorPieces(source, options).map(readArmorPiece);
  return calculatePiecemealArmorFromPieces(pieces, options);
}

export function calculateArmorPieceLocalTotal(summary, piece) {
  const activeMagic = summary?.magic ?? {};
  const enhancement = activeMagic.mode === MAGIC_MODES.suit
    ? numberOr(activeMagic.enhancementBonus)
    : activeMagic.appliedPieceId === piece.id
      ? numberOr(activeMagic.enhancementBonus)
      : 0;
  return pieceArmorBonus(piece) + enhancement;
}

export function buildAggregateItemData(summary, { internal = false } = {}) {
  const armorValue = internal ? summary.armorBonus + summary.enhancementBonus : summary.armorBonus;
  const enhancementValue = internal ? 0 : summary.enhancementBonus;
  return {
    name: internal ? INTERNAL_ARMOR_PROFILE_NAME : AGGREGATE_ARMOR_NAME,
    type: "equipment",
    system: {
      equipped: true,
      equipmentType: internal ? "misc" : "armor",
      equipmentSubtype: internal ? "clothing" : summary.equipmentSubtype,
      masterwork: false,
      armor: {
        value: armorValue,
        enh: enhancementValue,
        dex: summary.maxDex,
        acp: summary.acp === 0 ? 0 : -Math.abs(summary.acp)
      },
      spellFailure: summary.spellFailure,
      slot: internal ? "slotless" : "armor",
      weight: 0,
      price: summary.cost ?? 0,
      description: {
        value: "Module-generated aggregate item for equipped piecemeal armor pieces."
      }
    },
    flags: {
      [MODULE_ID]: {
        ...(internal ? {
          [FLAGS.internalArmor]: {
            isInternal: true,
            generatedAt: new Date().toISOString()
          }
        } : {}),
        [FLAGS.aggregate]: {
          isAggregate: true,
          internal,
          componentIds: summary.componentIds,
          generatedAt: new Date().toISOString(),
          summary: {
            rulesMode: summary.rulesMode,
            armorBonus: summary.armorBonus,
            enhancementBonus: summary.enhancementBonus,
            maxDex: summary.maxDex,
            acp: summary.acp,
            spellFailure: summary.spellFailure,
            equipmentSubtype: summary.equipmentSubtype,
            weight: summary.weight,
            cost: summary.cost,
            completeSuit: summary.completeSuit,
            mixedSuit: summary.mixedSuit,
            suitArmorBonus: summary.suitArmorBonus,
            mixedSuitSpellFailurePenalty: summary.mixedSuitSpellFailurePenalty,
            magic: summary.magic,
            material: summary.material,
            notes: summary.notes
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
    slot: item.system?.slot ?? "slotless",
    masterwork: item.system?.masterwork ?? false
  };
  if (typeof item.system?.equipped === "boolean") native.equipped = item.system.equipped;
  return native;
}

export function inferSyncedComponentVisualSlot(item) {
  const backup = getFlagData(item, FLAGS.nativeBackup);
  const native = backup?.native ?? buildNativeSnapshot(item);
  const flag = getFlagData(item, FLAGS.piecemeal) ?? {};
  const coverage = firstNonBlank(flag.coverageSlots, flag.coverageSlot, flag.slot);
  return visualSlotFromNativeSlot(native.slot) ??
    visualSlotFromNativeSlot(item.system?.slot) ??
    visualSlotFromCoverage(coverage) ??
    "slotless";
}

export function buildNeutralizeUpdate(item, { profileRole = "source", profileSlot = null } = {}) {
  const backup = getFlagData(item, FLAGS.nativeBackup);
  const native = backup?.native ?? buildNativeSnapshot(item);
  const keepArmorSlot = profileRole === "baseline";

  return {
    "system.equipped": true,
    "system.equipmentType": keepArmorSlot ? "armor" : "misc",
    "system.equipmentSubtype": keepArmorSlot ? native.equipmentSubtype : "clothing",
    "system.masterwork": false,
    "system.armor.value": 0,
    "system.armor.enh": 0,
    "system.armor.dex": null,
    "system.armor.acp": 0,
    "system.spellFailure": 0,
    "system.slot": keepArmorSlot ? native.slot ?? "slotless" : profileSlot ?? inferSyncedComponentVisualSlot(item),
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
    "system.masterwork": native.masterwork ?? false,
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

export async function syncArmorAggregate(actor, { dryRun = false, equippedOnly = false, rulesMode = null } = {}) {
  if (!actor) throw new Error("syncArmorAggregate requires an actor.");
  const plan = previewArmorSync(actor, { equippedOnly, rulesMode });
  if (dryRun) return plan;
  if (plan.summary.activePieces.length === 0) {
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
