import { FULL_ATTACK_MODES, MODULE_ID, SETTINGS } from "./constants.js";
import {
  buildAttackExtraPart,
  buildCalledShotCardPayload,
  clearCalledShot,
  consumeCalledShot,
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
import { createCalledShotChatCard } from "./ui.js";

const CHAT_ATTACK_PATCHED = Symbol.for(`${MODULE_ID}.chatAttackPatched`);
const ITEM_USE_PATCHED = Symbol.for(`${MODULE_ID}.itemUsePatched`);

let attackDialogHookRegistered = false;
let preRollAllAttacksHookRegistered = false;

function settingEnabled(key, fallback = true) {
  try {
    return game.settings.get(MODULE_ID, key);
  } catch (_error) {
    return fallback;
  }
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

async function prepareCalledShotForRoll({ fullAttack, form, actor, item }) {
  if (!settingEnabled(SETTINGS.enableCalledShots, true) || !form) return false;
  const locationId = readCalledShotSelection(form);
  if (!locationId) return false;

  const options = {
    targetUuid: getSingleTargetUuid(),
    userId: getUserId(),
    rollScoped: true
  };

  if (!fullAttack) {
    stageCalledShot(actor, item, locationId, options);
    return true;
  }

  const mode = getCalledShotFullAttackMode();
  if (mode === FULL_ATTACK_MODES.disabled) return false;
  if (mode === FULL_ATTACK_MODES.first) {
    stageCalledShot(actor, item, locationId, options);
    return true;
  }
  if (mode === FULL_ATTACK_MODES.all) {
    stageCalledShotForEveryAttack(actor, item, locationId, options);
    return true;
  }

  let queue = readCalledShotQueue(form);
  if (!queue.some(Boolean)) {
    const attacks = getExpectedFullAttackRows(actor, item, form);
    queue = await openCalledShotPerAttackDialog({
      attacks,
      options: getCalledShotOptions(),
      defaultLocationId: locationId
    });
  }
  if (!queue.some(Boolean)) return false;
  stageCalledShotQueue(actor, item, queue, options);
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

export async function patchD35EAttackRolls() {
  if (globalThis.game?.system?.id !== "D35E") return false;
  const chatAttackModule = await import("/systems/D35E/module/item/chat/chatAttack.js");
  const ChatAttack = chatAttackModule.ChatAttack;
  if (!ChatAttack?.prototype?.addAttack) {
    console.warn(`${MODULE_ID} | D35E ChatAttack.addAttack was not found; called-shot attack penalties were not patched.`);
    return false;
  }
  if (ChatAttack.prototype[CHAT_ATTACK_PATCHED] === true) {
    await patchD35EItemUse();
    registerAttackDialogHook();
    registerPreRollAllAttacksHook();
    return true;
  }

  const original = ChatAttack.prototype.addAttack;
  ChatAttack.prototype.addAttack = async function d35ePacsAddAttack(options = {}) {
    let calledShot = null;
    const actor = options.actor ?? this.actor ?? this.item?.actor;
    if (settingEnabled(SETTINGS.enableCalledShots, true) && options.critical !== true) {
      calledShot = consumeCalledShot(actor, this.item);
      const extraPart = buildAttackExtraPart(calledShot);
      if (extraPart) {
        options = {
          ...options,
          extraParts: [...(options.extraParts ?? []), extraPart]
        };
      }
    }

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
  registerAttackDialogHook();
  registerPreRollAllAttacksHook();
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
