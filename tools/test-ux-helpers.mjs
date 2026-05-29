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
const {
  FLAGS,
  FULL_ATTACK_FEAT_RULE_MODES,
  FULL_ATTACK_MODES,
  LOCAL_ARMOR_AGGREGATION_MODES,
  MODULE_ID,
  OUTCOME_MODES,
  SETTINGS
} = await import("../scripts/constants.js");
const {
  buildLocalArmorLocationSettingsContext,
  buildLocalArmorCoverageEditorContext,
  buildProfileManagerContext,
  createLocalArmorLocationSettingsElement,
  registerSettings,
  updateLocalArmorAggregationMap,
  updateLocalArmorCoverageMap,
  updateLocalArmorLocationSettings,
  updateProfilesFromProfileManager
} = await import("../scripts/settings.js");
const { createPiecemealItemPanel, hideDisabledArmorAutomationRows } = await import("../scripts/ui.js");
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
assert.equal(registeredSettings.get(SETTINGS.enableExposedHeadshots).name, "Enable exposed headshots");
assert.equal(registeredSettings.get(SETTINGS.enableExposedHeadshots).default, false);
assert.match(registeredSettings.get(SETTINGS.enableExposedHeadshots).hint, /Eyes, Head, or Headband keeps the defender's full armor bonus/);
assert.equal(registeredSettings.get(SETTINGS.enableExposedHandShots).name, "Enable exposed hand shots");
assert.equal(registeredSettings.get(SETTINGS.enableExposedHandShots).default, false);
assert.match(registeredSettings.get(SETTINGS.enableExposedHandShots).hint, /Hands or Wrists keeps the defender's full armor bonus/);
assert.equal(registeredSettings.get(SETTINGS.enableCalledShotLocalArmor).name, "Called shots use local armor piece AC");
assert.equal(registeredSettings.get(SETTINGS.enableCalledShotLocalArmor).default, false);
assert.match(registeredSettings.get(SETTINGS.enableCalledShotLocalArmor).hint, /almost always makes called shots easier/);
assert.equal(registeredSettings.get(SETTINGS.calledShotLocalArmorAggregation).name, "Local armor AC source handling");
assert.equal(registeredSettings.get(SETTINGS.calledShotLocalArmorAggregation).default, LOCAL_ARMOR_AGGREGATION_MODES.sum);
assert.deepEqual(Object.keys(registeredSettings.get(SETTINGS.calledShotLocalArmorAggregation).choices), [
  LOCAL_ARMOR_AGGREGATION_MODES.sum,
  LOCAL_ARMOR_AGGREGATION_MODES.highest,
  LOCAL_ARMOR_AGGREGATION_MODES.perLocation
]);
assert.equal(registeredSettings.get(SETTINGS.calledShotLocalArmorAggregation).choices[LOCAL_ARMOR_AGGREGATION_MODES.perLocation], "Use per-location overrides");
assert.equal(registeredSettings.get(SETTINGS.calledShotLocalArmorAggregationMap).config, false);
assert.deepEqual(registeredSettings.get(SETTINGS.calledShotLocalArmorAggregationMap).default, {});
assert.equal(registeredSettings.get(SETTINGS.calledShotLocalArmorCoverageMap).config, false);
assert.deepEqual(registeredSettings.get(SETTINGS.calledShotLocalArmorCoverageMap).default, {});
assert.equal(registeredSettings.get(SETTINGS.enableHelmetHeadCoverage).config, false);
assert.equal(registeredSettings.get(SETTINGS.enableHelmetHeadCoverage).default, false);
assert.equal(registeredSettings.get(SETTINGS.enableHelmetSkillPenalties).name, "Apply helmet Spot/Listen penalties");
assert.match(registeredSettings.get(SETTINGS.enableHelmetSkillPenalties).hint, /stays available even when piecemeal armor or called shots are off/);
assert.equal(registeredSettings.get(SETTINGS.enableHelmetSkillPenalties).default, false);
assert.equal(registeredSettings.get(SETTINGS.defaultHelmetSpotPenalty).name, "Default helmet Spot penalty");
assert.equal(registeredSettings.get(SETTINGS.defaultHelmetSpotPenalty).default, -2);
assert.equal(registeredSettings.get(SETTINGS.defaultHelmetListenPenalty).name, "Default helmet Listen penalty");
assert.equal(registeredSettings.get(SETTINGS.defaultHelmetListenPenalty).default, -2);
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
assert.equal(registeredSettings.get(SETTINGS.locationArmorOverlay).name, "Show called-shot coverage overlay");
assert.equal(registeredSettings.get(SETTINGS.locationArmorOverlay).default, false);
assert.equal(registeredSettings.get(SETTINGS.calledShotLocalArmorLocations).config, false);
assert.deepEqual(registeredSettings.get(SETTINGS.calledShotLocalArmorLocations).default, {});
assert.equal(registeredMenus.has("calledShotProfileEditor"), true);
assert.equal(registeredMenus.has("calledShotLocalArmorLocations"), false);
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

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(...classNames) {
    for (const className of classNames) this.values.add(className);
  }

  remove(...classNames) {
    for (const className of classNames) this.values.delete(className);
  }

  toggle(className, force) {
    if (force === true) {
      this.values.add(className);
      return true;
    }
    if (force === false) {
      this.values.delete(className);
      return false;
    }
    if (this.values.has(className)) {
      this.values.delete(className);
      return false;
    }
    this.values.add(className);
    return true;
  }

  contains(className) {
    return this.values.has(className);
  }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.attributes = {};
    this.children = [];
    this.classList = new FakeClassList();
    this.dataset = {};
    this.style = {};
  }

  append(...children) {
    this.children.push(...children);
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  setAttribute(key, value) {
    this.attributes[key] = String(value);
  }

  get textContent() {
    return [
      this._textContent ?? "",
      ...this.children.map((child) => child?.textContent ?? "")
    ].join("");
  }

  set textContent(value) {
    this._textContent = String(value);
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    if (selector.includes(",")) {
      const seen = new Set();
      const combined = [];
      for (const part of selector.split(",").map((entry) => entry.trim()).filter(Boolean)) {
        for (const element of this.querySelectorAll(part)) {
          if (seen.has(element)) continue;
          seen.add(element);
          combined.push(element);
        }
      }
      return combined;
    }
    const results = [];
    const matches = (element) => {
      if (!(element instanceof FakeElement)) return false;
      if (selector.startsWith(".")) return element.classList.contains(selector.slice(1));
      if (selector === "details") return element.tagName === "DETAILS";
      if (selector === "section") return element.tagName === "SECTION";
      if (selector === "input" || selector === "select" || selector === "textarea" || selector === "button") {
        return element.tagName.toLowerCase() === selector;
      }
      const nameMatch = selector.match(/^\[name="(.+)"\]$/);
      if (nameMatch) return element.name === nameMatch[1];
      return element.tagName.toLowerCase() === selector.toLowerCase();
    };
    const walk = (element) => {
      for (const child of element.children ?? []) {
        if (matches(child)) results.push(child);
        if (child instanceof FakeElement) walk(child);
      }
    };
    walk(this);
    return results;
  }
}

const originalDocument = globalThis.document;
globalThis.document = {
  createElement(tagName) {
    return new FakeElement(tagName);
  },
  createTextNode(text) {
    return { textContent: String(text) };
  }
};
const panel = createPiecemealItemPanel({
  type: "equipment",
  system: {
    armor: { value: 0, enh: 0, dex: 2, acp: 2 },
    equipmentSubtype: "mediumArmor",
    price: 25,
    spellFailure: 15,
    weight: 10
  },
  getFlag(moduleId, key) {
    if (moduleId !== MODULE_ID) return undefined;
    if (key === FLAGS.piecemeal) {
      return {
        enabled: true,
        armorFamily: "chain",
        catalogId: "chain-legs",
        coverageSlots: "legs; feet",
        pieceCategory: "legs",
        suitId: "test-suit"
      };
    }
    if (key === FLAGS.helmet) {
      return {
        enabled: true,
        armorFamily: "chain",
        coverageSlots: "head; eyes; ears",
        localArmorBonus: 5
      };
    }
    return undefined;
  }
});
globalThis.document = originalDocument;
assert.deepEqual(panel.querySelectorAll(".d35e-pacs-section").map((section) => section.dataset.d35ePacsPanelSection), [
  "Piecemeal armor",
  "Magic, material, and suit data",
  "Helmet skill penalties"
]);
assert.deepEqual(panel.querySelectorAll("details").map((details) => details.querySelector("summary").textContent), [
  "Show magic and suit fields",
  "Show helmet skill fields"
]);
for (const fieldName of [
  `flags.${MODULE_ID}.${FLAGS.piecemeal}.catalogId`,
  `flags.${MODULE_ID}.${FLAGS.piecemeal}.pieceCategory`,
  `flags.${MODULE_ID}.${FLAGS.piecemeal}.coverageSlots`,
  `flags.${MODULE_ID}.${FLAGS.piecemeal}.suitId`,
  `flags.${MODULE_ID}.${FLAGS.piecemeal}.masterwork`,
  `flags.${MODULE_ID}.${FLAGS.helmet}.enabled`,
  `flags.${MODULE_ID}.${FLAGS.helmet}.spotPenalty`
]) {
  assert.ok(panel.querySelector(`[name="${fieldName}"]`), `Missing PAcS panel field: ${fieldName}`);
}

const context = buildProfileManagerContext(profiles);
assert.equal(context.activeProfileId, "pf1e-uc-raw-adapted");
assert.ok(context.locations.length >= 10);
assert.ok(context.locations[0].normalJson.includes("["));

const localArmorContext = buildLocalArmorLocationSettingsContext(profiles, { hand: false });
assert.equal(localArmorContext.profileLabel, "PF1e Ultimate Combat RAW-adapted defaults");
assert.equal(localArmorContext.locations.find((location) => location.id === "arm").enabled, true);
assert.equal(localArmorContext.locations.find((location) => location.id === "hand").enabled, false);
const fakeDoc = {
  createElement(tagName) {
    return new FakeElement(tagName);
  },
  createTextNode(text) {
    return { textContent: String(text) };
  }
};
const masterRow = new FakeElement("div");
const masterLabel = new FakeElement("label");
masterLabel.textContent = "Called shots use local armor piece AC";
const masterNotes = new FakeElement("p");
masterNotes.classList.add("notes");
masterNotes.textContent = "Long native setting hint.";
const masterHint = new FakeElement("small");
masterHint.classList.add("hint");
masterHint.textContent = "Second native setting hint.";
const masterInput = new FakeElement("input");
masterInput.type = "checkbox";
masterInput.checked = false;
masterInput.name = `${MODULE_ID}.${SETTINGS.enableCalledShotLocalArmor}`;
const masterFields = new FakeElement("div");
masterFields.classList.add("form-fields");
masterFields.append(masterInput);
masterRow.append(masterLabel, masterNotes, masterHint, masterFields);
const aggregationRow = new FakeElement("div");
const aggregationLabel = new FakeElement("label");
aggregationLabel.textContent = "Local armor AC source handling";
const aggregationSelect = new FakeElement("select");
aggregationSelect.name = `${MODULE_ID}.${SETTINGS.calledShotLocalArmorAggregation}`;
const aggregationNotes = new FakeElement("p");
aggregationNotes.classList.add("notes");
aggregationNotes.textContent = "Controls how multiple mapped local armor sources are combined.";
const aggregationFields = new FakeElement("div");
aggregationFields.classList.add("form-fields");
aggregationFields.append(aggregationSelect);
aggregationRow.append(aggregationLabel, aggregationFields, aggregationNotes);
const localArmorElement = createLocalArmorLocationSettingsElement(localArmorContext, fakeDoc, {
  masterEnabled: false,
  masterRow,
  aggregationRow,
  lockReason: "Enable piecemeal armor above to use local armor piece AC."
});
assert.ok(localArmorElement.classList.contains("d35e-pacs-settings-child-block"));
assert.ok(localArmorElement.classList.contains("d35e-pacs-settings-child-block-inactive"));
assert.equal(localArmorElement.dataset.d35ePacsSettingsChild, "called-shot-local-armor");
assert.equal(localArmorElement.dataset.localArmorEnabled, "false");
assert.ok(localArmorElement.querySelector(".d35e-pacs-settings-child-header"));
assert.ok(localArmorElement.querySelector(".d35e-pacs-settings-master-toggle"));
assert.ok(localArmorElement.querySelector(".d35e-pacs-settings-aggregation-row"));
assert.ok(localArmorElement.querySelector(".form-fields"));
assert.ok(localArmorElement.querySelector(`[name="${MODULE_ID}.${SETTINGS.enableCalledShotLocalArmor}"]`));
assert.ok(localArmorElement.querySelector(`[name="${MODULE_ID}.${SETTINGS.calledShotLocalArmorAggregation}"]`));
assert.ok(localArmorElement.textContent.includes("Local armor piece AC"));
assert.ok(localArmorElement.textContent.includes("Enable for called shots"));
assert.ok(localArmorElement.textContent.includes("Enable piecemeal armor above to use local armor piece AC."));
assert.equal(masterNotes.hidden, true);
assert.equal(masterHint.hidden, true);
assert.equal(localArmorElement.textContent.includes("Long native setting hint."), false);
assert.equal(localArmorElement.textContent.includes("Second native setting hint."), false);
assert.ok(localArmorElement.textContent.includes("Edit coverage map"));
assert.ok(localArmorElement.textContent.includes("Location is covered by: PAcS Arms, Wrists, Shoulders"));
assert.ok(localArmorElement.textContent.includes("Location is covered by: Hands, Wrists"));
assert.equal(localArmorElement.textContent.includes("Armor/equipment slot:"), false);
assert.equal(localArmorElement.textContent.includes("Coverage:"), false);
assert.ok(localArmorElement.querySelector(`[name="location.arm.enabled"]`));
assert.ok(localArmorElement.querySelector(`[name="location.hand.enabled"]`));
assert.equal(updateLocalArmorLocationSettings({ hand: false }, {
  "location.arm.enabled": "on",
  "location.hand.enabled": false
}, profiles).hand, false);

const coverageContext = buildLocalArmorCoverageEditorContext(profiles, {
  eye: { pacs: [], native: ["head"] }
}, {
  eye: LOCAL_ARMOR_AGGREGATION_MODES.highest
});
const eyeCoverage = coverageContext.locations.find((location) => location.id === "eye");
assert.equal(coverageContext.profileLabel, "PF1e Ultimate Combat RAW-adapted defaults");
assert.equal(eyeCoverage.protectionLabel, "Head");
assert.equal(eyeCoverage.defaultLabel, "Eyes, Head, Headband");
assert.equal(eyeCoverage.nativeOptions.find((option) => option.value === "head").checked, true);
assert.equal(eyeCoverage.nativeOptions.find((option) => option.value === "eyes").checked, false);
assert.equal(eyeCoverage.aggregation, LOCAL_ARMOR_AGGREGATION_MODES.highest);
assert.equal(eyeCoverage.aggregationLabel, "Use highest applicable bonus");
assert.equal(eyeCoverage.aggregationOverridden, true);
assert.equal(eyeCoverage.aggregationOptions.find((option) => option.value === LOCAL_ARMOR_AGGREGATION_MODES.highest).selected, true);
const coverageMap = updateLocalArmorCoverageMap({}, {
  "coverage.eye.present": "1",
  "coverage.eye.native.head": "on"
}, profiles);
assert.deepEqual(coverageMap.eye, { pacs: [], native: ["head"] });
const resetCoverageMap = updateLocalArmorCoverageMap({ eye: { pacs: [], native: ["head"] } }, {
  "coverage.eye.present": "1",
  "coverage.eye.native.eyes": "on",
  "coverage.eye.native.head": "on",
  "coverage.eye.native.headband": "on"
}, profiles);
assert.equal(Object.prototype.hasOwnProperty.call(resetCoverageMap, "eye"), false);
const unorderedDefaultCoverageMap = updateLocalArmorCoverageMap({}, {
  "coverage.arm.present": "1",
  "coverage.arm.pacs.arms": "on",
  "coverage.arm.native.shoulders": "on",
  "coverage.arm.native.wrists": "on"
}, profiles);
assert.equal(Object.prototype.hasOwnProperty.call(unorderedDefaultCoverageMap, "arm"), false);
const emptyCoverageMap = updateLocalArmorCoverageMap({}, {
  "coverage.eye.present": "1"
}, profiles);
assert.deepEqual(emptyCoverageMap.eye, { pacs: [], native: [] });
const aggregationMap = updateLocalArmorAggregationMap({}, {
  "coverage.eye.present": "1",
  "aggregation.eye": LOCAL_ARMOR_AGGREGATION_MODES.highest
}, profiles);
assert.deepEqual(aggregationMap, { eye: LOCAL_ARMOR_AGGREGATION_MODES.highest });
const resetAggregationMap = updateLocalArmorAggregationMap({ eye: LOCAL_ARMOR_AGGREGATION_MODES.highest }, {
  "coverage.eye.present": "1",
  "aggregation.eye": LOCAL_ARMOR_AGGREGATION_MODES.sum
}, profiles);
assert.deepEqual(resetAggregationMap, {});
const customProfiles = {
  schemaVersion: profiles.schemaVersion,
  activeProfileId: "custom",
  profiles: [{
    id: "custom",
    label: "Custom profile",
    locations: [{
    id: "Tail-Spike",
    label: "Tail Spike",
    enabled: true,
    difficulty: "easy",
    penalty: -2,
    coverageSlot: "legs",
    outcomes: {
      normal: [],
      critical: [],
      debilitating: []
    }
  }]
  }]
};
const customCoverageMap = updateLocalArmorCoverageMap({}, {
  "coverage.Tail-Spike.present": "1",
  "coverage.Tail-Spike.native.feet": "on"
}, customProfiles);
assert.deepEqual(customCoverageMap.tailspike, { pacs: [], native: ["feet"] });
const customCoverageContext = buildLocalArmorCoverageEditorContext(customProfiles, customCoverageMap);
const tailCoverage = customCoverageContext.locations.find((location) => location.id === "Tail-Spike");
assert.equal(tailCoverage.protectionLabel, "Feet");
assert.equal(tailCoverage.defaultLabel, "PAcS Legs, Feet");
assert.equal(tailCoverage.overridden, true);

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
