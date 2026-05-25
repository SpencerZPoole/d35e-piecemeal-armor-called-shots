export const MODULE_ID = "d35e-piecemeal-armor-called-shots";
export const MODULE_TITLE = "D35E Piecemeal Armor And Called Shots";
export const AGGREGATE_ARMOR_NAME = "Piecemeal Armor Aggregate";
export const INTERNAL_ARMOR_PROFILE_NAME = "PAcS Armor Profile";

export const SETTINGS = Object.freeze({
  rulesMode: "rulesMode",
  armorWorkflowMode: "armorWorkflowMode",
  enableArmor: "enableArmorAutomation",
  enableCalledShots: "enableCalledShots",
  calledShotFullAttackMode: "calledShotFullAttackMode",
  calledShotLocalArmorMode: "calledShotLocalArmorMode",
  calledShotProfiles: "calledShotProfiles",
  locationArmorOverlay: "locationArmorOverlay",
  showGmOnlyDetails: "showGmOnlyDetails"
});

export const RULES_MODES = Object.freeze({
  rawAdapted: "rawAdapted",
  legacyWorkflow: "legacyWorkflow"
});

export const ARMOR_WORKFLOW_MODES = Object.freeze({
  nativeProfile: "nativeProfile",
  legacyAggregate: "legacyAggregate"
});

export const FULL_ATTACK_MODES = Object.freeze({
  perAttack: "perAttack",
  first: "first",
  all: "all",
  disabled: "disabled"
});

export const LOCAL_ARMOR_MODES = Object.freeze({
  adjust: "adjust",
  display: "display",
  disabled: "disabled"
});

export const FLAGS = Object.freeze({
  piecemeal: "piecemeal",
  aggregate: "aggregate",
  armorProfile: "armorProfile",
  internalArmor: "internalArmor",
  nativeBackup: "nativeBackup",
  calledShotEffect: "calledShotEffect",
  calledShotLedger: "calledShotLedger"
});

export const PIECE_CATEGORIES = Object.freeze({
  arms: "arms",
  legs: "legs",
  torso: "torso"
});

export const MAGIC_MODES = Object.freeze({
  none: "none",
  separatePiece: "separatePiece",
  suit: "suit"
});

export const DON_STATES = Object.freeze({
  normal: "normal",
  hasty: "hasty"
});

export const ARMOR_SUBTYPE_WEIGHT = Object.freeze({
  clothing: 0,
  lightArmor: 1,
  mediumArmor: 2,
  heavyArmor: 3
});

export const ABILITY_KEYS = Object.freeze(["str", "dex", "con", "int", "wis", "cha"]);
