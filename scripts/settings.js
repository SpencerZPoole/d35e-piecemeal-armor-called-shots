import {
  ARMOR_WORKFLOW_MODES,
  FULL_ATTACK_FEAT_RULE_MODES,
  FULL_ATTACK_MODES,
  LOCAL_ARMOR_MODES,
  MODULE_ID,
  MODULE_TITLE,
  OUTCOME_MODES,
  RULES_MODES,
  SETTINGS
} from "./constants.js";
import { getDefaultCalledShotProfiles, normalizeCalledShotProfiles } from "./profiles.js";

const HandlebarsApplication = globalThis.foundry?.applications?.api?.HandlebarsApplicationMixin?.(
  globalThis.foundry?.applications?.api?.ApplicationV2
) ?? class {
  static DEFAULT_OPTIONS = {};
  static PARTS = {};
  constructor(options = {}) {
    this.options = options;
  }
  async _prepareContext() {
    return {};
  }
  async _onRender() {}
  render() {}
};

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeJson(value, fallback = []) {
  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
}

function worldActors() {
  const actors = globalThis.game?.actors;
  if (!actors) return [];
  if (Array.isArray(actors)) return actors;
  if (actors.contents) return actors.contents;
  if (typeof actors[Symbol.iterator] === "function") return [...actors];
  return [];
}

function rerenderOpenActorSheets() {
  const windows = Object.values(globalThis.ui?.windows ?? {});
  for (const app of windows) {
    const document = app?.actor ?? app?.document ?? app?.object ?? null;
    const isActorSheet = Boolean(app?.actor) ||
      document?.documentName === "Actor" ||
      document?.constructor?.documentName === "Actor";
    if (isActorSheet) app.render?.(true);
  }
}

async function updateArmorAutomationState(enabled) {
  const {
    readArmorProfile,
    resumeArmorProfileAutomation,
    suspendArmorProfileAutomation,
    syncPacsEquipmentSlots
  } = await import("./armor-profile.js");
  syncPacsEquipmentSlots(enabled);
  if (globalThis.game?.ready !== true) {
    rerenderOpenActorSheets();
    return;
  }
  const actorIds = worldActors().map((actor) => actor?.id).filter(Boolean);
  for (const actorId of actorIds) {
    const actor = globalThis.game?.actors?.get?.(actorId);
    if (!actor) continue;
    const profile = readArmorProfile(actor);
    const hasProfile = Boolean(profile.baselineItemId || Object.values(profile.slots ?? {}).some(Boolean));
    if (!hasProfile) continue;
    if (enabled) await resumeArmorProfileAutomation(actor);
    else await suspendArmorProfileAutomation(actor);
  }
  rerenderOpenActorSheets();
}

let armorAutomationPendingState = null;
let armorAutomationTransition = null;

function queueArmorAutomationStateUpdate(enabled) {
  armorAutomationPendingState = enabled;
  if (armorAutomationTransition) return armorAutomationTransition;

  armorAutomationTransition = (async () => {
    while (armorAutomationPendingState !== null) {
      const nextState = armorAutomationPendingState;
      armorAutomationPendingState = null;
      await updateArmorAutomationState(nextState);
    }
  })().finally(() => {
    armorAutomationTransition = null;
    if (armorAutomationPendingState !== null) {
      void queueArmorAutomationStateUpdate(armorAutomationPendingState)
        .catch((error) => logSettingUpdateFailure("piecemeal armor automation", error));
    }
  });

  return armorAutomationTransition;
}

async function updateCalledShotAutomationState(enabled) {
  if (enabled) return;
  const [{ clearAllCalledShots }, { clearAllStagedCalledShotDamageApplications }] = await Promise.all([
    import("./called-shots.js"),
    import("./local-armor.js")
  ]);
  clearAllCalledShots();
  clearAllStagedCalledShotDamageApplications();
}

function logSettingUpdateFailure(label, error) {
  console.error(`${MODULE_ID} | Failed to update ${label}.`, error);
  globalThis.ui?.notifications?.error?.(`Could not update ${label}. Check the console for details.`);
}

export function buildProfileManagerContext(profiles, activeProfileId = null) {
  const normalized = normalizeCalledShotProfiles(profiles);
  const selectedId = activeProfileId ?? normalized.activeProfileId;
  const activeProfile = normalized.profiles.find((profile) => profile.id === selectedId) ?? normalized.profiles[0];
  return {
    profiles: normalized.profiles.map((profile) => ({
      id: profile.id,
      label: profile.label,
      selected: profile.id === activeProfile.id
    })),
    activeProfileId: activeProfile.id,
    activeProfileLabel: activeProfile.label,
    activeProfileSource: activeProfile.source ?? "",
    activeProfileNotes: (activeProfile.notes ?? []).join("\n"),
    locations: (activeProfile.locations ?? []).map((location) => ({
      ...location,
      enabled: location.enabled !== false,
      normalJson: JSON.stringify(location.outcomes?.normal ?? [], null, 2),
      criticalJson: JSON.stringify(location.outcomes?.critical ?? [], null, 2),
      debilitatingJson: JSON.stringify(location.outcomes?.debilitating ?? [], null, 2)
    })),
    profileJson: JSON.stringify(normalized, null, 2)
  };
}

export function normalizeLocalArmorLocationSettings(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(Object.entries(source).map(([key, enabled]) => [key, enabled !== false]));
}

export function buildLocalArmorLocationSettingsContext(profiles, locationSettings = {}) {
  const normalized = normalizeCalledShotProfiles(profiles);
  const activeProfile = normalized.profiles.find((profile) => profile.id === normalized.activeProfileId) ?? normalized.profiles[0];
  const settings = normalizeLocalArmorLocationSettings(locationSettings);
  return {
    profileLabel: activeProfile.label,
    locations: (activeProfile.locations ?? [])
      .filter((location) => location.enabled !== false)
      .map((location) => ({
        id: location.id,
        label: location.label,
        coverageSlot: location.coverageSlot ?? "",
        difficulty: location.difficulty ?? "",
        enabled: settings[location.id] !== false
      }))
  };
}

export function updateLocalArmorLocationSettings(currentSettings, formData, profiles) {
  const current = normalizeLocalArmorLocationSettings(currentSettings);
  const context = buildLocalArmorLocationSettingsContext(profiles, current);
  for (const location of context.locations) {
    current[location.id] = formData[`location.${location.id}.enabled`] === true ||
      formData[`location.${location.id}.enabled`] === "on";
  }
  return current;
}

function setName(element, name) {
  element.setAttribute?.("name", name);
  element.name = name;
}

function setLocalArmorLocationVisualState(section, enabled) {
  section.dataset.localArmorEnabled = enabled ? "true" : "false";
  if (enabled) section.classList?.remove?.("d35e-pacs-settings-child-block-inactive");
  else section.classList?.add?.("d35e-pacs-settings-child-block-inactive");
}

function prepareLocalArmorMasterRow(row) {
  if (!row) return null;
  row.classList?.add?.("d35e-pacs-settings-master-toggle");
  row.dataset.d35ePacsSettingsMaster = "called-shot-local-armor";
  const label = row.querySelector?.("label");
  if (label) label.textContent = "Enable for called shots";
  const note = row.querySelector?.(".notes");
  if (note) note.hidden = true;
  return row;
}

export function createLocalArmorLocationSettingsElement(context, documentRef = globalThis.document, options = {}) {
  const section = documentRef.createElement("section");
  section.classList.add("d35e-pacs-settings-child-block");
  section.dataset.d35ePacsSettingsChild = "called-shot-local-armor";
  setLocalArmorLocationVisualState(section, options.masterEnabled === true);

  const header = documentRef.createElement("div");
  header.classList.add("d35e-pacs-settings-child-header");
  section.appendChild(header);

  const title = documentRef.createElement("h4");
  title.textContent = "Local armor piece AC";
  header.appendChild(title);

  const masterRow = prepareLocalArmorMasterRow(options.masterRow);
  if (masterRow) header.appendChild(masterRow);

  const note = documentRef.createElement("p");
  note.classList.add("notes");
  note.textContent = `Choose which called-shot locations use local armor piece AC when this house rule is enabled. Active profile: ${context.profileLabel}. New locations default to enabled.`;
  section.appendChild(note);

  const grid = documentRef.createElement("div");
  grid.classList.add("d35e-pacs-settings-child-grid");
  section.appendChild(grid);

  for (const location of context.locations ?? []) {
    const label = documentRef.createElement("label");
    label.classList.add("d35e-pacs-settings-child-toggle");

    const input = documentRef.createElement("input");
    input.type = "checkbox";
    input.checked = location.enabled !== false;
    input.dataset.locationId = location.id;
    setName(input, `location.${location.id}.enabled`);
    label.appendChild(input);

    const text = documentRef.createElement("span");
    const strong = documentRef.createElement("strong");
    strong.textContent = location.label;
    text.appendChild(strong);
    const slot = documentRef.createElement("small");
    slot.textContent = `Armor/equipment slot: ${location.id}`;
    text.appendChild(slot);
    if (location.coverageSlot) {
      const small = documentRef.createElement("small");
      small.textContent = `Coverage: ${location.coverageSlot}`;
      text.appendChild(small);
    }
    label.appendChild(text);
    grid.appendChild(label);
  }

  return section;
}

function rootElement(html) {
  return html?.[0] ?? html;
}

function findSettingRow(root, settingKey) {
  const input = root?.querySelector?.(`[name="${MODULE_ID}.${settingKey}"]`) ??
    root?.querySelector?.(`[name="${settingKey}"]`);
  if (!input) return null;
  return input.closest?.(".form-group") ?? input.parentElement?.closest?.(".form-group") ?? input.parentElement ?? null;
}

function readLocalArmorSettingsFromElement(section) {
  const data = {};
  for (const input of section?.querySelectorAll?.("input[type='checkbox'][name]") ?? []) {
    data[input.name] = input.checked ? "on" : false;
  }
  return data;
}

async function saveInlineLocalArmorLocationSettings(section) {
  const settings = updateLocalArmorLocationSettings(
    game.settings.get(MODULE_ID, SETTINGS.calledShotLocalArmorLocations),
    readLocalArmorSettingsFromElement(section),
    game.settings.get(MODULE_ID, SETTINGS.calledShotProfiles)
  );
  await game.settings.set(MODULE_ID, SETTINGS.calledShotLocalArmorLocations, settings);
}

export function injectLocalArmorLocationSettings(root) {
  const element = rootElement(root);
  if (!element?.querySelector) return false;

  const existing = element.querySelector?.("[data-d35e-pacs-settings-child='called-shot-local-armor']");
  const row = findSettingRow(element, SETTINGS.enableCalledShotLocalArmor);
  if (!row) return false;
  const parent = existing?.parentElement ?? row.parentElement;
  if (!parent) return false;
  const anchor = existing?.nextSibling ?? row.nextSibling;
  const input = row.querySelector?.(`[name="${MODULE_ID}.${SETTINGS.enableCalledShotLocalArmor}"]`) ??
    row.querySelector?.(`[name="${SETTINGS.enableCalledShotLocalArmor}"]`);
  existing?.remove?.();

  const section = createLocalArmorLocationSettingsElement(buildLocalArmorLocationSettingsContext(
    game.settings.get(MODULE_ID, SETTINGS.calledShotProfiles),
    game.settings.get(MODULE_ID, SETTINGS.calledShotLocalArmorLocations)
  ), globalThis.document, {
    masterEnabled: input?.checked === true,
    masterRow: row
  });
  input?.addEventListener?.("change", () => {
    setLocalArmorLocationVisualState(section, input.checked === true);
  });
  section.addEventListener?.("change", (event) => {
    if (!event.target?.matches?.("input[type='checkbox']")) return;
    if (event.target === input) return;
    void saveInlineLocalArmorLocationSettings(section).catch((error) => {
      console.error(`${MODULE_ID} | Failed to save called-shot local armor locations.`, error);
      globalThis.ui?.notifications?.error?.("Could not save called-shot local armor locations. Check the console for details.");
    });
  });

  if (anchor) parent.insertBefore?.(section, anchor);
  else parent.appendChild?.(section);
  return true;
}

let settingsConfigHookRegistered = false;

export function registerSettingsConfigHooks() {
  if (settingsConfigHookRegistered || !globalThis.Hooks?.on) return false;
  Hooks.on("renderSettingsConfig", (_app, html) => {
    if (injectLocalArmorLocationSettings(html)) return;
    globalThis.setTimeout?.(() => {
      injectLocalArmorLocationSettings(globalThis.document);
    }, 0);
  });
  settingsConfigHookRegistered = true;
  return true;
}

export function updateProfilesFromProfileManager(profiles, formData, activeProfileId) {
  const normalized = normalizeCalledShotProfiles(profiles);
  const profile = normalized.profiles.find((entry) => entry.id === activeProfileId) ?? normalized.profiles[0];
  const prefix = "location.";
  profile.label = formData.profileLabel || profile.label;
  profile.source = formData.profileSource || "";
  profile.notes = String(formData.profileNotes ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  for (const location of profile.locations ?? []) {
    const base = `${prefix}${location.id}.`;
    if (`${base}enabled` in formData) {
      location.enabled = formData[`${base}enabled`] === true || formData[`${base}enabled`] === "on";
    }
    location.label = formData[`${base}label`] || location.label;
    location.penalty = Number(formData[`${base}penalty`] ?? location.penalty);
    location.coverageSlot = formData[`${base}coverageSlot`] || location.coverageSlot || "";
    location.difficulty = formData[`${base}difficulty`] || location.difficulty || "";
    location.outcomes = {
      normal: safeJson(formData[`${base}normalJson`], location.outcomes?.normal ?? []),
      critical: safeJson(formData[`${base}criticalJson`], location.outcomes?.critical ?? []),
      debilitating: safeJson(formData[`${base}debilitatingJson`], location.outcomes?.debilitating ?? [])
    };
  }
  normalized.activeProfileId = profile.id;
  return normalizeCalledShotProfiles(normalized);
}

export class CalledShotProfileEditor extends HandlebarsApplication {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-profile-editor`,
    tag: "form",
    classes: ["standard-form", "d35e-pacs", "called-shot-profile-editor"],
    window: {
      title: `${MODULE_TITLE}: Called Shot Profiles`,
      icon: "fa-solid fa-crosshairs",
      resizable: true
    },
    position: {
      width: 980,
      height: 760
    }
  };

  static PARTS = {
    body: {
      template: `modules/${MODULE_ID}/templates/called-shot-profile-editor.hbs`,
      scrollable: [".d35e-pacs-profile-locations", ".d35e-pacs-advanced-json"]
    }
  };

  constructor(options = {}) {
    super(options);
    this.activeProfileId = options.activeProfileId ?? null;
  }

  async _prepareContext(options = {}) {
    return {
      ...(await super._prepareContext(options)),
      ...buildProfileManagerContext(game.settings.get(MODULE_ID, SETTINGS.calledShotProfiles), this.activeProfileId)
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this.element;
    if (!root) return;
    root.addEventListener("submit", (event) => {
      event.preventDefault();
      this.saveProfileManager().catch((error) => {
        console.error(`${MODULE_ID} | Failed to save called-shot profile manager.`, error);
        ui.notifications.error(error.message ?? String(error));
      });
    });
    root.querySelector("[name='activeProfileId']")?.addEventListener("change", (event) => {
      this.activeProfileId = event.currentTarget.value;
      this.render({ force: true });
    });
    root.querySelector("[data-action='reset-defaults']")?.addEventListener("click", async (event) => {
      event.preventDefault();
      await game.settings.set(MODULE_ID, SETTINGS.calledShotProfiles, getDefaultCalledShotProfiles());
      ui.notifications.info("Called shot profiles reset to module defaults.");
      this.activeProfileId = null;
      this.render({ force: true });
    });
    root.querySelector("[data-action='clone-profile']")?.addEventListener("click", async (event) => {
      event.preventDefault();
      const profiles = cloneData(game.settings.get(MODULE_ID, SETTINGS.calledShotProfiles));
      const context = buildProfileManagerContext(profiles, this.activeProfileId);
      const source = profiles.profiles.find((profile) => profile.id === context.activeProfileId);
      const clone = cloneData(source);
      clone.id = `${clone.id}-copy-${Date.now().toString(36)}`;
      clone.label = `${clone.label} Copy`;
      profiles.profiles.push(clone);
      profiles.activeProfileId = clone.id;
      await game.settings.set(MODULE_ID, SETTINGS.calledShotProfiles, normalizeCalledShotProfiles(profiles));
      this.activeProfileId = clone.id;
      this.render({ force: true });
    });
    root.querySelector("[data-action='import-json']")?.addEventListener("click", async (event) => {
      event.preventDefault();
      try {
        const textarea = root.querySelector("[name='profileJson']");
        const parsed = normalizeCalledShotProfiles(textarea?.value ?? "");
        await game.settings.set(MODULE_ID, SETTINGS.calledShotProfiles, parsed);
        this.activeProfileId = parsed.activeProfileId;
        ui.notifications.info("Called shot profiles imported.");
        this.render({ force: true });
      } catch (error) {
        console.error(`${MODULE_ID} | Failed to import called-shot profiles.`, error);
        ui.notifications.error(error.message ?? String(error));
      }
    });
  }

  async saveProfileManager() {
    const formData = new FormData(this.element);
    const data = Object.fromEntries(formData.entries());
    for (const checkbox of this.element.querySelectorAll("input[type='checkbox'][name]")) {
      if (!data[checkbox.name]) data[checkbox.name] = false;
    }
    const profiles = updateProfilesFromProfileManager(
      game.settings.get(MODULE_ID, SETTINGS.calledShotProfiles),
      data,
      data.activeProfileId || this.activeProfileId
    );
    this.activeProfileId = profiles.activeProfileId;
    await game.settings.set(MODULE_ID, SETTINGS.calledShotProfiles, profiles);
    ui.notifications.info("Called shot profiles saved.");
    this.render({ force: true });
  }
}

export function registerSettings() {
  game.settings.register(MODULE_ID, SETTINGS.rulesMode, {
    name: "Rules mode",
    hint: "Compatibility setting retained for older worlds. Normal runtime uses RAW-adapted behavior.",
    scope: "world",
    config: false,
    type: String,
    choices: {
      [RULES_MODES.rawAdapted]: "RAW-adapted automation",
      [RULES_MODES.legacyWorkflow]: "Legacy v1.0 workflow"
    },
    default: RULES_MODES.rawAdapted
  });

  game.settings.register(MODULE_ID, SETTINGS.armorWorkflowMode, {
    name: "Piecemeal armor workflow",
    hint: "Compatibility setting retained for older worlds. Normal runtime uses the native PAcS armor-slot profile.",
    scope: "world",
    config: false,
    type: String,
    choices: {
      [ARMOR_WORKFLOW_MODES.nativeProfile]: "Native armor profile",
      [ARMOR_WORKFLOW_MODES.legacyAggregate]: "Legacy aggregate sync"
    },
    default: ARMOR_WORKFLOW_MODES.nativeProfile
  });

  game.settings.register(MODULE_ID, SETTINGS.enableArmor, {
    name: "Enable piecemeal armor",
    hint: "Adds the PAcS Torso, Arms, and Legs inventory slots, piecemeal armor math, and hidden D35E carrier. Disabling this hides the PAcS slots and suspends armor automation, but does not disable called shots.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: (enabled) => {
      void queueArmorAutomationStateUpdate(enabled).catch((error) => logSettingUpdateFailure("piecemeal armor automation", error));
    }
  });

  game.settings.register(MODULE_ID, SETTINGS.enableCalledShots, {
    name: "Enable called shots",
    hint: "Adds the Called Shot selector to D35E's native attack dialog, applies configured attack penalties, carries called-shot context into Apply Damage, and posts outcome cards. Disabling this does not disable piecemeal armor.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: (enabled) => {
      void updateCalledShotAutomationState(enabled).catch((error) => logSettingUpdateFailure("called-shot automation", error));
    }
  });

  game.settings.register(MODULE_ID, SETTINGS.enableExposedHeadshots, {
    name: "Enable exposed headshots",
    hint: "Optional non-RAW house rule. Head, Eye, and Ear called shots remove the defender's armor bonus only when no equipped equipment item occupies D35E's native Head slot; any equipped Head-slot equipment keeps the defender's full armor bonus.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, SETTINGS.enableExposedHandShots, {
    name: "Enable exposed hand shots",
    hint: "Optional non-RAW house rule. Hand called shots remove the defender's armor bonus only when no equipped equipment item occupies D35E's native Hands slot; any equipped Hands-slot equipment keeps the defender's full armor bonus.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, SETTINGS.enableCalledShotLocalArmor, {
    name: "Called shots use local armor piece AC",
    hint: "Advanced house rule. This almost always makes called shots easier for the attacker by using only the defender's matching armor piece AC for the armor bonus, not the armor bonus from the full suit/profile.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, SETTINGS.enableHelmetHeadCoverage, {
    name: "Enable helmet head coverage house rule",
    hint: "Compatibility setting retained for older worlds. Helmet local armor AC has been superseded by exposed headshots.",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, SETTINGS.enableHelmetSkillPenalties, {
    name: "Apply helmet Spot/Listen penalties",
    hint: "Optional non-RAW house rule. Configured PAcS helmets can use per-item values, and ordinary equipped D35E Head-slot items can use the default Spot and Listen penalties below.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, SETTINGS.defaultHelmetSpotPenalty, {
    name: "Default helmet Spot penalty",
    hint: "Used when helmet Spot/Listen penalties are enabled and an equipped Head-slot item has no explicit PAcS Spot value. Set to 0 to disable the default Spot penalty.",
    scope: "world",
    config: true,
    type: Number,
    default: -2
  });

  game.settings.register(MODULE_ID, SETTINGS.defaultHelmetListenPenalty, {
    name: "Default helmet Listen penalty",
    hint: "Used when helmet Spot/Listen penalties are enabled and an equipped Head-slot item has no explicit PAcS Listen value. Set to 0 to disable the default Listen penalty.",
    scope: "world",
    config: true,
    type: Number,
    default: -2
  });

  game.settings.register(MODULE_ID, SETTINGS.calledShotOutcomeMode, {
    name: "Called-shot effect automation",
    hint: "Controls what happens after D35E Apply Damage resolves a called shot. The default applies normal results automatically and asks the GM before critical or debilitating effects change an actor.",
    scope: "world",
    config: true,
    type: String,
    choices: {
      [OUTCOME_MODES.confirmSevere]: "GM confirms severe effects",
      [OUTCOME_MODES.automatic]: "Apply effects automatically",
      [OUTCOME_MODES.advisory]: "Advisory only"
    },
    default: OUTCOME_MODES.confirmSevere
  });

  game.settings.register(MODULE_ID, SETTINGS.calledShotFullAttackMode, {
    name: "Called shots on full attacks",
    hint: "Controls how the native D35E Full Attack button applies a selected called-shot location.",
    scope: "world",
    config: true,
    type: String,
    choices: {
      [FULL_ATTACK_MODES.perAttack]: "Ask for each attack",
      [FULL_ATTACK_MODES.first]: "First attack only",
      [FULL_ATTACK_MODES.all]: "Every attack",
      [FULL_ATTACK_MODES.disabled]: "Disable on full attacks"
    },
    default: FULL_ATTACK_MODES.perAttack
  });

  game.settings.register(MODULE_ID, SETTINGS.calledShotFullAttackFeatRules, {
    name: "Called-shot full-attack feat rules",
    hint: "Controls whether Improved Called Shot and Greater Called Shot are required for called shots during D35E Full Attack. Feat bonuses still require the actor to actually have the feat.",
    scope: "world",
    config: true,
    type: String,
    choices: {
      [FULL_ATTACK_FEAT_RULE_MODES.require]: "Require feats (RAW-adapted)",
      [FULL_ATTACK_FEAT_RULE_MODES.warnOnly]: "Warn only",
      [FULL_ATTACK_FEAT_RULE_MODES.ignore]: "Do not require feats"
    },
    default: FULL_ATTACK_FEAT_RULE_MODES.require
  });

  game.settings.register(MODULE_ID, SETTINGS.calledShotLocalArmorMode, {
    name: "Called-shot local armor AC",
    hint: "Compatibility setting retained for older worlds. Normal runtime uses RAW called-shot AC plus optional exposed head/hand settings.",
    scope: "world",
    config: false,
    type: String,
    choices: {
      [LOCAL_ARMOR_MODES.adjust]: "Adjust AC in Apply Damage",
      [LOCAL_ARMOR_MODES.display]: "Show adjustment only",
      [LOCAL_ARMOR_MODES.disabled]: "Disabled"
    },
    default: LOCAL_ARMOR_MODES.adjust
  });

  game.settings.register(MODULE_ID, SETTINGS.locationArmorOverlay, {
    name: "Show called-shot coverage overlay",
    hint: "Disabled by default. When enabled, called-shot cards show the matching armor coverage slot(s) as advisory information only. This does not change called-shot AC.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, SETTINGS.showGmOnlyDetails, {
    name: "Show GM-only called shot details",
    hint: "Compatibility setting retained for older clients. GM-only source and outcome metadata is now shown to GM users automatically.",
    scope: "client",
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.calledShotProfiles, {
    name: "Called shot profiles",
    scope: "world",
    config: false,
    type: Object,
    default: getDefaultCalledShotProfiles()
  });

  game.settings.register(MODULE_ID, SETTINGS.calledShotLocalArmorLocations, {
    name: "Called-shot local armor locations",
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.registerMenu(MODULE_ID, "calledShotProfileEditor", {
    name: "Edit called shot profiles",
    label: "Open Profile Editor",
    hint: "Edit locations, penalties, severity tiers, coverage mapping, and outcome effects as JSON.",
    icon: "fas fa-crosshairs",
    type: CalledShotProfileEditor,
    restricted: true
  });
}
