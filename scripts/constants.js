export const MODULE_ID = "d35e-piecemeal-armor-called-shots";
export const MODULE_TITLE = "D35E Piecemeal Armor And Called Shots";
export const AGGREGATE_ARMOR_NAME = "Piecemeal Armor Aggregate";

export const SETTINGS = Object.freeze({
  enableArmor: "enableArmorAutomation",
  enableCalledShots: "enableCalledShots",
  calledShotFullAttackMode: "calledShotFullAttackMode",
  calledShotLocalArmorMode: "calledShotLocalArmorMode",
  calledShotProfiles: "calledShotProfiles",
  locationArmorOverlay: "locationArmorOverlay",
  showGmOnlyDetails: "showGmOnlyDetails"
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
  nativeBackup: "nativeBackup",
  calledShotEffect: "calledShotEffect"
});

export const ARMOR_SUBTYPE_WEIGHT = Object.freeze({
  clothing: 0,
  lightArmor: 1,
  mediumArmor: 2,
  heavyArmor: 3
});

export const ABILITY_KEYS = Object.freeze(["str", "dex", "con", "int", "wis", "cha"]);
