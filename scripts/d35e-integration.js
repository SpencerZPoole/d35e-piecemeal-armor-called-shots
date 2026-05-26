import { FULL_ATTACK_FEAT_RULE_MODES, FULL_ATTACK_MODES, MODULE_ID, RULES_MODES, SETTINGS } from "./constants.js";
import { getCurrentRulesMode } from "./armor.js";
import {
  applyAutomaticCalledShotOutcome,
  buildAttackExtraParts,
  buildCalledShotCardPayload,
  clearCalledShot,
  consumeCalledShot,
  getCalledShotFullAttackFeatRuleMode,
  getCalledShotFeatState,
  getCalledShotOptions,
  noteCalledShotAttackSequence,
  stageCalledShot,
  stageCalledShotForEveryAttack,
  stageCalledShotQueue
} from "./called-shots.js";
import {
  getCalledShotFullAttackMode,
  injectCalledShotControls,
  openCalledShotPerAttackDialog,
  readCalledShotQueue,
  readCalledShotSelection
} from "./attack-dialog.js";
import {
  applyStagedCalledShotLocalArmor,
  applyCalledShotConcealmentAdjustment,
  attachCalledShotToDamageCard,
  noteCalledShotDamageHit,
  noteCalledShotFinalDamage,
  takeCalledShotDamageContext
} from "./local-armor.js";
import { createCalledShotChatCard } from "./ui.js";

const CHAT_ATTACK_PATCHED = Symbol.for(`${MODULE_ID}.chatAttackPatched`);
const CHAT_DAMAGE_CARDS_PATCHED = Symbol.for(`${MODULE_ID}.chatDamageCardsPatched`);
const ACTIVE_CALLED_SHOT = Symbol.for(`${MODULE_ID}.activeCalledShot`);
const ITEM_USE_PATCHED = Symbol.for(`${MODULE_ID}.itemUsePatched`);
const DAMAGE_HELPER_PATCHED = Symbol.for(`${MODULE_ID}.damageHelperPatched`);

let attackDialogHookRegistered = false;
let preRollAllAttacksHookRegistered = false;
let preHitCheckHookRegistered = false;
let damageHitHookRegistered = false;
let damageCalculationHookRegistered = false;
let concealmentHookRegistered = false;

function settingEnabled(key, fallback = true) {
  try {
    return game.settings.get(MODULE_ID, key);
  } catch (_error) {
    return fallback;
  }
}

export function canApplyCalledShotLocalArmor() {
  return settingEnabled(SETTINGS.enableArmor, true) !== false && settingEnabled(SETTINGS.enableCalledShots, true) !== false;
}

function getUserId() {
  return globalThis.game?.user?.id ?? "node";
}

function getSingleTargetUuid() {
  const target = [...(game.user?.targets ?? [])][0];
  return target?.document?.uuid ?? target?.actor?.uuid ?? null;
}

function formCheckboxChecked(form, selector) {
  return form?.querySelector?.(selector)?.checked === true;
}

function formInputNumber(form, selector, fallback = 0) {
  const value = Number(form?.querySelector?.(selector)?.value);
  return Number.isFinite(value) ? value : fallback;
}

function getExpectedFullAttackRows(actor, item, form) {
  let count;
  const autoScaleAttacks =
    (game.settings.get("D35E", "autoScaleAttacksBab") &&
      actor?.type !== "npc" &&
      foundry.utils.getProperty(item.system, "attackType") === "weapon" &&
      foundry.utils.getProperty(item.system, "autoScaleOption") !== "never") ||
    foundry.utils.getProperty(item.system, "autoScaleOption") === "always";

  if (autoScaleAttacks) {
    const nonepicBab = Math.max(0, foundry.utils.getProperty(actor.system, "attributes.bab.nonepic") || 0);
    count = 1 + Math.max(0, Math.floor((nonepicBab - 1) / 5));
  } else {
    count = (foundry.utils.getProperty(item.system, "attackParts") || []).length + 1;
  }

  if (formCheckboxChecked(form, "input[data-feat='rapid-shot']")) count += 1;
  if (formCheckboxChecked(form, "input[data-feat='flurry-of-blows']")) count += 1;
  if (formCheckboxChecked(form, "input[data-feat='greater-manyshot']")) {
    count *= Math.max(1, formInputNumber(form, "input[name='greater-manyshot-count']", 1));
  }

  return Array.from({ length: Math.max(1, count) }, (_entry, index) => ({
    id: `attack-${index + 1}`,
    label: index === 0 ? "Attack" : `Attack ${index + 1}`
  }));
}

export function resolveFullAttackFeatRuleDecision({
  rulesMode = RULES_MODES.rawAdapted,
  featRuleMode = FULL_ATTACK_FEAT_RULE_MODES.require,
  feats = {},
  mode = FULL_ATTACK_MODES.perAttack,
  calledShotCount = 1
} = {}) {
  if (mode === FULL_ATTACK_MODES.disabled) return { allow: false, repeatPenaltyAfterFirst: false, warnings: [], info: null, forceFirst: false };

  const rawAdapted = rulesMode === RULES_MODES.rawAdapted;
  const normalizedRule = Object.values(FULL_ATTACK_FEAT_RULE_MODES).includes(featRuleMode)
    ? featRuleMode
    : FULL_ATTACK_FEAT_RULE_MODES.require;
  const multipleCalledShots = mode === FULL_ATTACK_MODES.all || Number(calledShotCount) > 1;
  const repeatPenaltyAfterFirst = rawAdapted && multipleCalledShots;
  const warnings = [];

  if (!rawAdapted || normalizedRule === FULL_ATTACK_FEAT_RULE_MODES.ignore) {
    return { allow: true, repeatPenaltyAfterFirst, warnings, info: null, forceFirst: false };
  }

  if (normalizedRule === FULL_ATTACK_FEAT_RULE_MODES.require) {
    if (!feats.improved) {
      return {
        allow: false,
        repeatPenaltyAfterFirst,
        warnings: ["RAW-adapted called shots cannot be combined with D35E Full Attack unless the attacker has Improved Called Shot."],
        info: null,
        forceFirst: false
      };
    }
    if (multipleCalledShots && !feats.greater) {
      return {
        allow: true,
        repeatPenaltyAfterFirst: false,
        warnings,
        info: "Improved Called Shot allows one called shot during a full attack; applying it to the first attack only.",
        forceFirst: true
      };
    }
    return { allow: true, repeatPenaltyAfterFirst, warnings, info: null, forceFirst: false };
  }

  if (!feats.improved) warnings.push("This full-attack called shot would normally require Improved Called Shot.");
  if (multipleCalledShots && !feats.greater) warnings.push("Multiple called shots in one full attack would normally require Greater Called Shot.");
  return { allow: true, repeatPenaltyAfterFirst, warnings, info: null, forceFirst: false };
}

function showFullAttackFeatRuleDecision(decision) {
  for (const warning of decision.warnings ?? []) ui.notifications?.warn(warning);
  if (decision.info) ui.notifications?.info(decision.info);
}

async function prepareCalledShotForRoll({ fullAttack, form, actor, item }) {
  if (!settingEnabled(SETTINGS.enableCalledShots, true) || !form) return false;
  const locationId = readCalledShotSelection(form);
  if (!locationId) return false;
  const rulesMode = getCurrentRulesMode();
  const feats = getCalledShotFeatState(actor);
  const featRuleMode = getCalledShotFullAttackFeatRuleMode();

  const options = {
    targetUuid: getSingleTargetUuid(),
    userId: getUserId(),
    rollScoped: true,
    rulesMode
  };

  if (!fullAttack) {
    stageCalledShot(actor, item, locationId, options);
    return true;
  }

  const mode = getCalledShotFullAttackMode();
  if (mode === FULL_ATTACK_MODES.disabled) return false;
  const expectedAttackCount = getExpectedFullAttackRows(actor, item, form).length;
  const initialDecision = resolveFullAttackFeatRuleDecision({
    rulesMode,
    featRuleMode,
    feats,
    mode,
    calledShotCount: mode === FULL_ATTACK_MODES.all ? expectedAttackCount : 1
  });
  if (!initialDecision.allow) {
    showFullAttackFeatRuleDecision(initialDecision);
    return false;
  }
  if (initialDecision.forceFirst) {
    showFullAttackFeatRuleDecision(initialDecision);
    stageCalledShot(actor, item, locationId, options);
    return true;
  }
  if (mode === FULL_ATTACK_MODES.first) {
    showFullAttackFeatRuleDecision(initialDecision);
    stageCalledShot(actor, item, locationId, options);
    return true;
  }
  if (mode === FULL_ATTACK_MODES.all) {
    showFullAttackFeatRuleDecision(initialDecision);
    stageCalledShotForEveryAttack(actor, item, locationId, {
      ...options,
      repeatPenaltyAfterFirst: initialDecision.repeatPenaltyAfterFirst
    });
    return true;
  }

  let queue = readCalledShotQueue(form);
  if (!queue.some(Boolean)) {
    queue = await openCalledShotPerAttackDialog({
      attacks: getExpectedFullAttackRows(actor, item, form),
      options: getCalledShotOptions(),
      defaultLocationId: locationId
    });
  }
  if (!queue.some(Boolean)) return false;
  const selectedCount = queue.filter(Boolean).length;
  const queueDecision = resolveFullAttackFeatRuleDecision({
    rulesMode,
    featRuleMode,
    feats,
    mode,
    calledShotCount: selectedCount
  });
  if (!queueDecision.allow) {
    showFullAttackFeatRuleDecision(queueDecision);
    return false;
  }
  if (queueDecision.forceFirst) {
    showFullAttackFeatRuleDecision(queueDecision);
    stageCalledShot(actor, item, queue.find(Boolean) || locationId, options);
    return true;
  }
  showFullAttackFeatRuleDecision(queueDecision);
  stageCalledShotQueue(actor, item, queue, {
    ...options,
    repeatPenaltyAfterFirst: queueDecision.repeatPenaltyAfterFirst
  });
  return true;
}

function registerAttackDialogHook() {
  if (attackDialogHookRegistered || !globalThis.Hooks?.on) return;
  Hooks.on("renderDialog", (_app, html) => {
    if (!settingEnabled(SETTINGS.enableCalledShots, true)) return;
    injectCalledShotControls(html);
  });
  attackDialogHookRegistered = true;
}

function registerPreRollAllAttacksHook() {
  if (preRollAllAttacksHookRegistered || !globalThis.Hooks?.on) return;
  Hooks.on("D35E.ItemUse.preRollAllAttacks", (item, _rollData, allAttacks, userId) => {
    if (!settingEnabled(SETTINGS.enableCalledShots, true)) return;
    noteCalledShotAttackSequence(item?.actor, item, allAttacks, userId);
  });
  preRollAllAttacksHookRegistered = true;
}

function registerPreHitCheckHook() {
  if (preHitCheckHookRegistered || !globalThis.Hooks?.on) return;
  Hooks.on("D35E.DamageRoll.preHitCheck", (actor, hookValues, userId) => {
    if (!canApplyCalledShotLocalArmor()) return;
    applyStagedCalledShotLocalArmor(actor, hookValues?.finalAc, userId);
  });
  preHitCheckHookRegistered = true;
}

function registerDamageHitHook() {
  if (damageHitHookRegistered || !globalThis.Hooks?.on) return;
  Hooks.on("D35E.DamageRoll.hit", (actor, hookValues, userId) => {
    noteCalledShotDamageHit(actor, hookValues, userId);
  });
  damageHitHookRegistered = true;
}

function registerDamageCalculationHook() {
  if (damageCalculationHookRegistered || !globalThis.Hooks?.on) return;
  Hooks.on("D35E.DamageRoll.calculateDamage", (actor, hookValues, userId) => {
    noteCalledShotFinalDamage(actor, hookValues?.finalDamage, userId);
  });
  damageCalculationHookRegistered = true;
}

function registerConcealmentHook() {
  if (concealmentHookRegistered || !globalThis.Hooks?.on) return;
  Hooks.on("D35E.DamageRoll.preRollConcealment", (actor, hookValues, userId) => {
    applyCalledShotConcealmentAdjustment(actor, hookValues, userId);
  });
  concealmentHookRegistered = true;
}

function patchD35EDamageCards(ChatAttack) {
  if (ChatAttack.prototype[CHAT_DAMAGE_CARDS_PATCHED] === true) return;
  const originalCreateCard = ChatAttack.prototype.createChatCardData;
  const originalCreateCriticalCard = ChatAttack.prototype.createCriticalChatCardData;

  ChatAttack.prototype.createChatCardData = function d35ePacsCreateChatCardData(...args) {
    return attachCalledShotToDamageCard(originalCreateCard.call(this, ...args), this[ACTIVE_CALLED_SHOT]);
  };

  ChatAttack.prototype.createCriticalChatCardData = function d35ePacsCreateCriticalChatCardData(...args) {
    return attachCalledShotToDamageCard(originalCreateCriticalCard.call(this, ...args), this[ACTIVE_CALLED_SHOT]);
  };

  Object.defineProperty(ChatAttack.prototype, CHAT_DAMAGE_CARDS_PATCHED, { value: true });
}

export async function patchD35EAttackRolls() {
  if (globalThis.game?.system?.id !== "D35E") return false;
  const chatAttackModule = await import("/systems/D35E/module/item/chat/chatAttack.js");
  const ChatAttack = chatAttackModule.ChatAttack;
  if (!ChatAttack?.prototype?.addAttack) {
    console.warn(`${MODULE_ID} | D35E ChatAttack.addAttack was not found; called-shot attack penalties were not patched.`);
    return false;
  }
  if (ChatAttack.prototype[CHAT_ATTACK_PATCHED] === true) {
    patchD35EDamageCards(ChatAttack);
    await patchD35EItemUse();
    await patchD35EDamageHelper();
    registerAttackDialogHook();
    registerPreRollAllAttacksHook();
    registerPreHitCheckHook();
    registerDamageHitHook();
    registerDamageCalculationHook();
    registerConcealmentHook();
    return true;
  }

  patchD35EDamageCards(ChatAttack);
  const original = ChatAttack.prototype.addAttack;
  ChatAttack.prototype.addAttack = async function d35ePacsAddAttack(options = {}) {
    let calledShot = null;
    const actor = options.actor ?? this.actor ?? this.item?.actor;
    if (settingEnabled(SETTINGS.enableCalledShots, true) && options.critical !== true) {
      calledShot = consumeCalledShot(actor, this.item);
      const extraParts = buildAttackExtraParts(calledShot);
      if (extraParts.length) {
        options = {
          ...options,
          extraParts: [...(options.extraParts ?? []), ...extraParts]
        };
      }
    }
    if (calledShot) this[ACTIVE_CALLED_SHOT] = calledShot;
    const result = await original.call(this, options);
    if (calledShot) {
      const payload = buildCalledShotCardPayload(calledShot);
      await createCalledShotChatCard({
        payload,
        actor,
        item: this.item,
        attackTotal: this.attack?.total,
        isCriticalThreat: this.attack?.isCrit === true
      });
    }
    return result;
  };

  Object.defineProperty(ChatAttack.prototype, CHAT_ATTACK_PATCHED, { value: true });
  console.info(`${MODULE_ID} | D35E called-shot attack penalty patch applied.`);
  await patchD35EItemUse();
  await patchD35EDamageHelper();
  registerAttackDialogHook();
  registerPreRollAllAttacksHook();
  registerPreHitCheckHook();
  registerDamageHitHook();
  registerDamageCalculationHook();
  registerConcealmentHook();
  return true;
}

async function patchD35EItemUse() {
  const itemUseModule = await import("/systems/D35E/module/item/extensions/use.js");
  const ItemUse = itemUseModule.ItemUse;
  if (!ItemUse?.prototype?.rollAttack) {
    console.warn(`${MODULE_ID} | D35E ItemUse.rollAttack was not found; called-shot dialog selections were not patched.`);
    return false;
  }
  if (ItemUse.prototype[ITEM_USE_PATCHED] === true) return true;

  const original = ItemUse.prototype.rollAttack;
  ItemUse.prototype.rollAttack = async function d35ePacsRollAttack(fullAttack, form, temporaryItem, actor, rollData, skipChargeCheck) {
    const rollActor = actor ?? this.item?.actor;
    const stagedByDialog = await prepareCalledShotForRoll({
      fullAttack,
      form,
      actor: rollActor,
      item: this.item
    });
    try {
      return await original.call(this, fullAttack, form, temporaryItem, actor, rollData, skipChargeCheck);
    } finally {
      if (stagedByDialog) clearCalledShot(rollActor, this.item, getUserId());
    }
  };

  Object.defineProperty(ItemUse.prototype, ITEM_USE_PATCHED, { value: true });
  console.info(`${MODULE_ID} | D35E native attack dialog called-shot patch applied.`);
  return true;
}

async function patchD35EDamageHelper() {
  const damageModule = await import("/systems/D35E/module/actor/helpers/actorDamageHelper.js");
  const ActorDamageHelper = damageModule.ActorDamageHelper;
  if (!ActorDamageHelper?.applyDamage) {
    console.warn(`${MODULE_ID} | D35E ActorDamageHelper.applyDamage was not found; automatic called-shot outcomes were not patched.`);
    return false;
  }
  if (ActorDamageHelper[DAMAGE_HELPER_PATCHED] === true) return true;

  const original = ActorDamageHelper.applyDamage;
  ActorDamageHelper.applyDamage = async function d35ePacsApplyDamage(...args) {
    const result = await original.call(this, ...args);
    const context = takeCalledShotDamageContext(getUserId());
    if (settingEnabled(SETTINGS.enableCalledShots, true) && context?.targetActor) {
      try {
        const outcome = await applyAutomaticCalledShotOutcome({
          targetActor: context.targetActor,
          context
        });
        if (outcome?.reason === "requiresGmConfirmation") {
          ui.notifications?.warn("A GM must confirm this severe called-shot outcome before actor effects are applied.");
        } else if (outcome?.reason === "declined") {
          ui.notifications?.info("Severe called-shot outcome was not applied.");
        }
      } catch (error) {
        console.error(`${MODULE_ID} | Failed to apply automatic called-shot outcome.`, error);
        ui.notifications?.error("Could not apply the called-shot outcome automatically. Check the console for details.");
      }
    }
    return result;
  };

  Object.defineProperty(ActorDamageHelper, DAMAGE_HELPER_PATCHED, { value: true });
  console.info(`${MODULE_ID} | D35E automatic called-shot outcome patch applied.`);
  return true;
}
