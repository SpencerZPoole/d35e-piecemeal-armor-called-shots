import { FLAGS, MAGIC_MODES, MODULE_ID } from "./constants.js";
import { RAW_ARMOR_PIECE_CATALOG, RAW_ARMOR_SUIT_CATALOG } from "./armor.js";

const CORE_VERSION = "14.363";
const SYSTEM_VERSION = "3.0.2";

export const PACK_SUIT_LABELS = Object.freeze({
  padded: "Padded",
  leather: "Leather",
  "studded-leather": "Studded Leather",
  hide: "Hide",
  scale: "Scale Mail",
  chain: "Chainmail",
  "chain-shirt": "Chain Shirt",
  breastplate: "Breastplate",
  banded: "Banded Mail",
  splint: "Splint Mail",
  "half-plate": "Half-Plate",
  "full-plate": "Full Plate"
});

export const CATEGORY_LABELS = Object.freeze({
  torso: "Torso",
  arms: "Arms",
  legs: "Legs"
});

const CATEGORY_ICONS = Object.freeze({
  torso: "icons/equipment/chest/breastplate-layered-steel.webp",
  arms: "icons/equipment/wrist/bracer-segmented-steel.webp",
  legs: "icons/equipment/feet/boots-armored-steel.webp"
});

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function catalogEntry(pieceId) {
  const entry = RAW_ARMOR_PIECE_CATALOG.find((piece) => piece.id === pieceId);
  if (!entry) throw new Error(`Missing armor catalog entry for ${pieceId}.`);
  return entry;
}

function suitEntry(suitId) {
  const entry = RAW_ARMOR_SUIT_CATALOG.find((suit) => suit.id === suitId);
  if (!entry) throw new Error(`Missing armor suit catalog entry for ${suitId}.`);
  return entry;
}

function documentId(index) {
  return `PacsArmPiece${String(index + 1).padStart(4, "0")}`;
}

function pieceDescription(name, piece, categoryLabel, { sourceItemName = "" } = {}) {
  const sourceText = sourceItemName
    ? `<p>This item was broken down from <strong>${sourceItemName}</strong>. Review copied magic or custom fields before play if the original armor had special automation.</p>`
    : "";
  return [
    `<p>${name} is a PAcS armor-piece item for the native D35E inventory workflow. Drag it to <strong>PAcS: ${categoryLabel}</strong> on an actor sheet; importing it into inventory by itself does not change AC.</p>`,
    `<p>Starter values: armor +${piece.armorBonus}, max Dex ${piece.maxDex ?? "none"}, ACP ${piece.acp}, ASF ${piece.spellFailure}%, weight ${piece.weight} lb. These values use the module's D35E-calibrated PF1e piecemeal adaptation, not official D&amp;D 3.5 RAW.</p>`,
    sourceText
  ].filter(Boolean).join("");
}

function physicalItemDefaults(name) {
  return {
    quantity: 1,
    hardness: 0,
    hp: { max: 10, value: 10 },
    identified: true,
    unidentified: { price: 0, name: "" },
    identifiedName: name
  };
}

export function armorPiecePackSpecs() {
  return RAW_ARMOR_SUIT_CATALOG
    .filter((suit) => PACK_SUIT_LABELS[suit.id])
    .flatMap((suit) => Object.entries(suit.pieceIds).map(([category, pieceId]) => ({
      suitId: suit.id,
      suitLabel: PACK_SUIT_LABELS[suit.id],
      category,
      pieceId
    })));
}

export function buildArmorPieceItemData(spec, index = 0, options = {}) {
  const piece = catalogEntry(spec.pieceId);
  const categoryLabel = CATEGORY_LABELS[spec.category] ?? spec.category;
  const suitLabel = spec.suitLabel ?? PACK_SUIT_LABELS[spec.suitId] ?? spec.suitId;
  const name = options.name ?? `[PAcS] ${suitLabel}, ${categoryLabel}`;
  const systemOverrides = options.systemOverrides ?? {};
  const piecemealOverrides = options.piecemealOverrides ?? {};
  const includeId = options.includeId !== false;
  const document = {
    name,
    type: "equipment",
    img: options.img ?? CATEGORY_ICONS[spec.category] ?? "icons/equipment/chest/breastplate-layered-steel.webp",
    system: {
      ...physicalItemDefaults(name),
      description: {
        value: pieceDescription(name, piece, categoryLabel, options),
        chat: "",
        unidentified: ""
      },
      equipmentType: "misc",
      equipmentSubtype: "clothing",
      slot: "slotless",
      equipped: false,
      carried: true,
      melded: false,
      armor: { value: 0, enh: 0, dex: null, acp: 0 },
      spellFailure: 0,
      weight: piece.weight,
      price: piece.cost,
      ...systemOverrides
    },
    effects: [],
    folder: null,
    sort: (index + 1) * 100000,
    ownership: { default: 0 },
    flags: {
      [MODULE_ID]: {
        piecemeal: {
          enabled: true,
          catalogId: piece.id,
          displaySuitId: spec.suitId,
          displaySuitLabel: suitLabel,
          pieceCategory: spec.category,
          coverageSlots: piece.coverageSlots,
          armorFamily: piece.armorFamily,
          equipmentSubtype: piece.equipmentSubtype,
          armorBonus: piece.armorBonus,
          enhancementBonus: 0,
          maxDex: piece.maxDex,
          acp: piece.acp,
          spellFailure: piece.spellFailure,
          weight: systemOverrides.weight ?? piece.weight,
          cost: systemOverrides.price ?? piece.cost,
          material: "",
          masterwork: false,
          magicMode: MAGIC_MODES.none,
          suitId: "",
          donState: "normal",
          ...piecemealOverrides
        }
      }
    },
    _stats: {
      compendiumSource: null,
      coreVersion: CORE_VERSION,
      createdTime: null,
      duplicateSource: null,
      exportSource: null,
      lastModifiedBy: null,
      modifiedTime: null,
      systemId: "D35E",
      systemVersion: SYSTEM_VERSION
    }
  };
  if (includeId) document._id = options.id ?? documentId(index);
  return document;
}

export function buildArmorPiecePackDocuments() {
  return armorPiecePackSpecs().map((spec, index) => buildArmorPieceItemData(spec, index));
}

export function buildArmorPieceDocumentsForSuit(suit, options = {}) {
  const suitLabel = options.suitLabel ?? PACK_SUIT_LABELS[suit.id] ?? suit.labels?.[0] ?? suit.id;
  const specs = Object.entries(suit.pieceIds).map(([category, pieceId]) => ({
    suitId: suit.id,
    suitLabel,
    category,
    pieceId
  }));
  return specs.map((spec, index) => buildArmorPieceItemData(spec, index, {
    ...options,
    includeId: options.includeId ?? false,
    systemOverrides: cloneData(options.systemOverridesByCategory?.[spec.category] ?? options.systemOverrides ?? {}),
    piecemealOverrides: cloneData(options.piecemealOverridesByCategory?.[spec.category] ?? options.piecemealOverrides ?? {})
  }));
}

export function expectedArmorPieceNames() {
  return armorPiecePackSpecs().map((spec) => `[PAcS] ${PACK_SUIT_LABELS[spec.suitId]}, ${CATEGORY_LABELS[spec.category] ?? spec.category}`);
}

export { catalogEntry, suitEntry };
