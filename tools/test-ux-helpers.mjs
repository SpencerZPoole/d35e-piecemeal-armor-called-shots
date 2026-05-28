import assert from "node:assert/strict";

globalThis.foundry = {
  applications: {
    api: {
      ApplicationV2: class {},
      HandlebarsApplicationMixin: (Base) => Base
    }
  }
};
const registeredSettings = new Map();
const registeredMenus = new Map();
globalThis.game = {
  user: {
    targets: []
  },
  settings: {
    register(moduleId, key, config) {
      registeredSettings.set(key, { moduleId, key, ...config });
    },
    registerMenu(moduleId, key, config) {
      registeredMenus.set(key, { moduleId, key, ...config });
    },
    get(moduleId, key) {
      if (key === "calledShotProfiles") return activeProfiles;
      if (key === "enableCalledShots") return true;
      return false;
    }
  }
};

const { getDefaultCalledShotProfiles } = await import("../scripts/profiles.js");
const { FULL_ATTACK_FEAT_RULE_MODES, FULL_ATTACK_MODES, OUTCOME_MODES, SETTINGS } = await import("../scripts/constants.js");
const { buildProfileManagerContext, registerSettings, updateProfilesFromProfileManager } = await import("../scripts/settings.js");
const { hideDisabledArmorAutomationRows } = await import("../scripts/ui.js");
const {
  CALLED_SHOT_QUEUE_NAME,
  CALLED_SHOT_SELECT_NAME,
  buildCalledShotControlHtml,
  buildExpectedFullAttackRows,
  normalizeCalledShotLocation,
  normalizeCalledShotQueue
} = await import("../scripts/attack-dialog.js");

const profiles = getDefaultCalledShotProfiles();
let activeProfiles = profiles;
registerSettings();
assert.equal(registeredSettings.get(SETTINGS.rulesMode).config, false);
assert.equal(registeredSettings.get(SETTINGS.armorWorkflowMode).config, false);
assert.equal(registeredSettings.get(SETTINGS.calledShotLocalArmorMode).config, false);
assert.equal(registeredSettings.get(SETTINGS.showGmOnlyDetails).config, false);
assert.equal(registeredSettings.get(SETTINGS.enableArmor).name, "Enable piecemeal armor");
assert.equal(registeredSettings.get(SETTINGS.enableCalledShots).name, "Enable called shots");
assert.equal(registeredSettings.get(SETTINGS.enableHelmetHeadCoverage).name, "Enable helmet head coverage house rule");
assert.equal(registeredSettings.get(SETTINGS.enableHelmetHeadCoverage).default, false);
assert.equal(registeredSettings.get(SETTINGS.enableHelmetSkillPenalties).name, "Apply helmet Spot/Listen penalties");
assert.equal(registeredSettings.get(SETTINGS.enableHelmetSkillPenalties).default, false);
assert.equal(registeredSettings.get(SETTINGS.calledShotOutcomeMode).name, "Called-shot effect automation");
assert.equal(registeredSettings.get(SETTINGS.calledShotOutcomeMode).default, OUTCOME_MODES.confirmSevere);
assert.equal(registeredSettings.get(SETTINGS.calledShotOutcomeMode).config, true);
assert.deepEqual(Object.keys(registeredSettings.get(SETTINGS.calledShotOutcomeMode).choices), [
  OUTCOME_MODES.confirmSevere,
  OUTCOME_MODES.automatic,
  OUTCOME_MODES.advisory
]);
assert.equal(registeredSettings.get(SETTINGS.calledShotFullAttackMode).name, "Called shots on full attacks");
assert.equal(registeredSettings.get(SETTINGS.calledShotFullAttackMode).default, FULL_ATTACK_MODES.perAttack);
assert.deepEqual(Object.keys(registeredSettings.get(SETTINGS.calledShotFullAttackMode).choices), [
  FULL_ATTACK_MODES.perAttack,
  FULL_ATTACK_MODES.first,
  FULL_ATTACK_MODES.all,
  FULL_ATTACK_MODES.disabled
]);
assert.equal(registeredSettings.get(SETTINGS.calledShotFullAttackFeatRules).name, "Called-shot full-attack feat rules");
assert.equal(registeredSettings.get(SETTINGS.calledShotFullAttackFeatRules).default, FULL_ATTACK_FEAT_RULE_MODES.require);
assert.equal(registeredSettings.get(SETTINGS.calledShotFullAttackFeatRules).choices[FULL_ATTACK_FEAT_RULE_MODES.warnOnly], "Warn only");
assert.equal(registeredSettings.get(SETTINGS.calledShotFullAttackFeatRules).config, true);
assert.equal(registeredSettings.get(SETTINGS.locationArmorOverlay).name, "Show location armor overlay");
assert.equal(registeredSettings.get(SETTINGS.locationArmorOverlay).default, false);
assert.equal(registeredMenus.has("calledShotProfileEditor"), true);
assert.match(registeredSettings.get(SETTINGS.enableArmor).hint, /hides the PAcS slots/);

function fakeRow(dataset) {
  return { dataset, hidden: false, style: {} };
}

const internalCarrier = {
  id: "carrier",
  type: "equipment",
  flags: { "d35e-piecemeal-armor-called-shots": { internalArmor: { isInternal: true } } },
  getFlag(moduleId, key) {
    return this.flags?.[moduleId]?.[key];
  }
};
const visibleArmor = {
  id: "armor",
  type: "equipment",
  flags: {},
  getFlag() {
    return undefined;
  }
};
const itemRows = [fakeRow({ itemId: "carrier" }), fakeRow({ itemId: "armor" })];
const slotRows = [
  fakeRow({ slot: "armor" }),
  fakeRow({ slot: "pacsTorso" }),
  fakeRow({ slot: "pacsArms" }),
  fakeRow({ slot: "pacsLegs" }),
  fakeRow({ slot: "shield" })
];
const fakeActor = {
  items: {
    get(id) {
      return id === "carrier" ? internalCarrier : id === "armor" ? visibleArmor : null;
    }
  }
};
const fakeRoot = {
  querySelectorAll(selector) {
    if (selector === "[data-item-id]") return itemRows;
    if (selector === ".slot-placeholder-row[data-slot]") return slotRows;
    return [];
  }
};
assert.deepEqual(hideDisabledArmorAutomationRows(fakeActor, fakeRoot), { internalRows: 1, pacsSlotRows: 3 });
assert.equal(itemRows[0].hidden, true);
assert.equal(itemRows[1].hidden, false);
assert.equal(slotRows.filter((row) => row.hidden).map((row) => row.dataset.slot).join(","), "pacsTorso,pacsArms,pacsLegs");
assert.equal(slotRows.find((row) => row.dataset.slot === "armor").hidden, false);
const context = buildProfileManagerContext(profiles);
assert.equal(context.activeProfileId, "pf1e-uc-raw-adapted");
assert.ok(context.locations.length >= 10);
assert.ok(context.locations[0].normalJson.includes("["));

const updated = updateProfilesFromProfileManager(profiles, {
  profileLabel: "Table Defaults",
  profileSource: "House profile",
  profileNotes: "Line one\nLine two",
  "location.arm.enabled": false,
  "location.arm.label": "Arm",
  "location.arm.penalty": "-4",
  "location.arm.coverageSlot": "arms",
  "location.arm.difficulty": "custom",
  "location.arm.normalJson": "[]",
  "location.arm.criticalJson": "[]",
  "location.arm.debilitatingJson": "[]"
}, "pf1e-uc-adapted");
activeProfiles = updated;
const arm = updated.profiles[0].locations.find((location) => location.id === "arm");
assert.equal(updated.profiles[0].label, "Table Defaults");
assert.equal(updated.profiles[0].notes.length, 2);
assert.equal(arm.enabled, false);
assert.equal(arm.penalty, -4);

const sampleLocations = activeProfiles.profiles[0].locations.filter((location) => ["ear", "eye"].includes(location.id));
const control = buildCalledShotControlHtml(sampleLocations, "eye");
assert.ok(control.includes(`name="${CALLED_SHOT_SELECT_NAME}"`));
assert.ok(control.includes(`name="${CALLED_SHOT_QUEUE_NAME}"`));
assert.ok(control.includes("None"));
assert.ok(control.includes("Eye (-10)"));
assert.equal(normalizeCalledShotLocation("none"), "");
assert.deepEqual(normalizeCalledShotQueue("[\"\", \"ear\", \"none\", {\"locationId\":\"eye\"}]"), ["", "ear", "", "eye"]);

const attackForm = {
  0: { name: "attack-bonus" },
  matches: (selector) => selector === "form.attack-form",
  querySelector(selector) {
    if (selector === `[name="${CALLED_SHOT_SELECT_NAME}"]`) return { value: "ear" };
    if (selector === `[name="${CALLED_SHOT_QUEUE_NAME}"]`) return { value: "[\"ear\",\"\"]" };
    return null;
  }
};
globalThis.Element = function Element() {};
globalThis.Document = function Document() {};
globalThis.DocumentFragment = function DocumentFragment() {};
Object.setPrototypeOf(attackForm, globalThis.Element.prototype);
const { readCalledShotQueue, readCalledShotSelection } = await import("../scripts/attack-dialog.js?html-root-test");
assert.equal(readCalledShotSelection(attackForm), "ear");
assert.deepEqual(readCalledShotQueue(attackForm), ["ear", ""]);

const formLike = {
  matches: () => true,
  querySelector(selector) {
    const rapid = selector.includes("rapid-shot");
    const flurry = selector.includes("flurry-of-blows");
    const greater = selector.includes("greater-manyshot");
    const count = selector.includes("greater-manyshot-count");
    if (count) return { value: "2" };
    if (rapid || flurry || greater) return { checked: true };
    return null;
  }
};
const rows = buildExpectedFullAttackRows(formLike, { textContent: "Full Attack (2 attacks)" });
assert.deepEqual(rows.map((row) => row.label), ["Attack", "Attack 2", "Attack 3", "Attack 4", "Attack 5", "Attack 6", "Attack 7", "Attack 8"]);

console.log("test-ux-helpers: ok");
