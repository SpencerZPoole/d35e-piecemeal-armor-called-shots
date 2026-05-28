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
    hint: "Adds the PAcS Torso, Arms, and Legs inventory slots, piecemeal armor math, hidden D35E carrier, and local armor data. Disabling this hides the PAcS slots and suspends armor automation, but does not disable called shots.",
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

  game.settings.register(MODULE_ID, SETTINGS.enableHelmetHeadCoverage, {
    name: "Enable helmet head coverage house rule",
    hint: "Optional non-RAW house rule. Equipped, configured helmets in D35E's Head slot protect Head, Eye, and Ear called shots through local armor AC without adding to total AC.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, SETTINGS.enableHelmetSkillPenalties, {
    name: "Apply helmet Spot/Listen penalties",
    hint: "Optional non-RAW house rule. Configured helmets in D35E's Head slot can add their table-defined Spot and Listen penalties to native D35E skill rolls.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
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
    hint: "Compatibility setting retained for older worlds. Normal runtime uses location armor automatically when piecemeal armor and called shots are both enabled.",
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
    name: "Show location armor overlay",
    hint: "Disabled by default. When enabled, called-shot cards show the matching piecemeal armor coverage slot(s) as advisory information only.",
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

  game.settings.registerMenu(MODULE_ID, "calledShotProfileEditor", {
    name: "Edit called shot profiles",
    label: "Open Profile Editor",
    hint: "Edit locations, penalties, severity tiers, coverage mapping, and outcome effects as JSON.",
    icon: "fas fa-crosshairs",
    type: CalledShotProfileEditor,
    restricted: true
  });
}
