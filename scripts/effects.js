import { ABILITY_KEYS, FLAGS, MODULE_ID } from "./constants.js";
import { validateEffectSpec } from "./profiles.js";

const SAVE_ALIASES = Object.freeze({
  fortitude: "fort",
  fort: "fort",
  reflex: "ref",
  ref: "ref",
  will: "will"
});

const CONDITION_ALIASES = Object.freeze({
  deafened: "deaf",
  blind: "blind",
  blinded: "blind",
  exhausted: "exhausted",
  fatigued: "fatigued",
  nauseated: "nauseated",
  sickened: "sickened",
  staggered: "staggered",
  stunned: "stunned",
  prone: "prone",
  dead: "dead",
  dying: "dying",
  disabled: "disabled",
  unconscious: "unconscious"
});

function getProperty(source, path) {
  if (!source || !path) return undefined;
  if (globalThis.foundry?.utils?.getProperty) return foundry.utils.getProperty(source, path);
  return path.split(".").reduce((current, key) => current?.[key], source);
}

function cloneData(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function numberOr(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeSaveType(value) {
  const key = String(value ?? "").trim().toLowerCase();
  return SAVE_ALIASES[key] ?? "";
}

function normalizeCondition(value) {
  const key = String(value ?? "").trim().toLowerCase();
  return CONDITION_ALIASES[key] ?? key;
}

function getActorItems(actor) {
  if (actor?.items?.contents) return actor.items.contents;
  if (Array.isArray(actor?.items)) return actor.items;
  return [];
}

async function rollFormula(formula) {
  if (!formula) return 0;
  if (globalThis.Roll) {
    const roll = await new Roll(formula).evaluate();
    return Number(roll.total) || 0;
  }
  const trimmed = String(formula).trim();
  const match = trimmed.match(/^(\d*)d(\d+)(?:\s*([+-])\s*(\d+))?$/i);
  if (!match) return Number(trimmed) || 0;
  const count = Number(match[1] || 1);
  const sides = Number(match[2]);
  const modifier = match[3] ? Number(`${match[3]}${match[4]}`) : 0;
  return count * Math.ceil(sides / 2) + modifier;
}

function activeEffectDocument(actor, id) {
  const effects = actor?.effects?.contents ?? actor?.effects ?? [];
  if (effects?.get) return effects.get(id);
  return Array.isArray(effects) ? effects.find((effect) => effect.id === id || effect._id === id) : null;
}

function saveBonus(actor, saveType) {
  const total = getProperty(actor, `system.attributes.savingThrows.${saveType}.total`);
  if (Number.isFinite(Number(total))) return Number(total);
  const value = getProperty(actor, `system.attributes.savingThrows.${saveType}.value`);
  if (Number.isFinite(Number(value))) return Number(value);
  return 0;
}

async function rollSave(actor, saveType, dc, state, key = "") {
  const normalized = normalizeSaveType(saveType);
  if (!normalized || !Number.isFinite(Number(dc))) return null;
  const cacheKey = `${key || normalized}:${normalized}:${dc}`;
  if (state.saveCache.has(cacheKey)) return state.saveCache.get(cacheKey);
  const bonus = saveBonus(actor, normalized);
  const roll = await rollFormula(`1d20 + ${bonus}`);
  const result = {
    type: normalized,
    dc: Number(dc),
    bonus,
    total: roll,
    success: roll >= Number(dc),
    margin: roll - Number(dc)
  };
  state.saveCache.set(cacheKey, result);
  state.ledger.saves.push(result);
  return result;
}

function shouldApplyByContext(effect, context) {
  if (effect.requiresSaveSuccess === true && context.saveResult?.success !== true) return false;
  if (effect.requiresSaveFailure === true && context.saveResult?.success !== false) return false;
  if (Number.isFinite(Number(effect.requiresSaveFailureBy))) {
    if (!context.saveResult || context.saveResult.success || context.saveResult.margin > -Number(effect.requiresSaveFailureBy)) return false;
  }
  return true;
}

function scaledAmount(amount, saveResult, saveEffect) {
  if (!saveResult?.success) return amount;
  if (saveEffect === "negate") return 0;
  if (saveEffect === "half") return Math.max(1, Math.floor(amount / 2));
  return amount;
}

async function updateActor(actor, update, state) {
  const previous = {};
  for (const path of Object.keys(update)) previous[path] = cloneData(getProperty(actor, path));
  state.ledger.actorUpdates.push({ previous, update: cloneData(update) });
  await actor.update(update);
}

async function setActorFlag(actor, flagKey, value) {
  if (actor?.setFlag) {
    await actor.setFlag(MODULE_ID, flagKey, value);
    return;
  }
  await actor?.update?.({ [`flags.${MODULE_ID}.${flagKey}`]: value });
}

function actorFlag(actor, flagKey, fallback = null) {
  return actor?.getFlag?.(MODULE_ID, flagKey) ?? actor?.flags?.[MODULE_ID]?.[flagKey] ?? fallback;
}

function buildNoteEffect(effect, context) {
  return {
    name: effect.label || context.label || "Called Shot Effect",
    icon: effect.icon || "icons/svg/blood.svg",
    disabled: false,
    duration: effect.duration ?? {},
    changes: Array.isArray(effect.changes) ? effect.changes : [],
    flags: {
      [MODULE_ID]: {
        [FLAGS.calledShotEffect]: {
          locationId: context.locationId,
          locationLabel: context.locationLabel,
          severity: context.severity,
          text: effect.text || effect.description || "",
          source: "called-shot"
        }
      }
    }
  };
}

async function createEffect(actor, data, state) {
  const created = await actor.createEmbeddedDocuments?.("ActiveEffect", [data]);
  const effect = created?.[0] ?? null;
  const id = effect?.id ?? effect?._id ?? data._id ?? null;
  if (id) state.ledger.createdEffects.push(id);
  return { type: "activeEffect", id, data };
}

function chooseAbility(effect) {
  if (ABILITY_KEYS.includes(effect.ability)) return effect.ability;
  const choices = Array.isArray(effect.abilities) ? effect.abilities.filter((ability) => ABILITY_KEYS.includes(ability)) : [];
  if (!choices.length) return "";
  return choices[Math.floor(Math.random() * choices.length)];
}

async function applyCondition(actor, effect, context, state) {
  const status = normalizeCondition(effect.status);
  const path = `system.attributes.conditions.${status}`;
  await updateActor(actor, { [path]: true }, state);
  await actor.conditions?.toggleConditionStatusIcons?.();
  return { type: "condition", status };
}

async function applyAbilityDamage(actor, effect, context, state) {
  const ability = chooseAbility(effect);
  if (!ABILITY_KEYS.includes(ability)) throw new Error(`Invalid ability key: ${effect.ability ?? effect.abilities}`);
  const save = effect.save ? await rollSave(actor, effect.save, context.saveDc, state, effect.saveKey) : context.saveResult ?? null;
  let amount = await rollFormula(effect.formula ?? effect.amount ?? 0);
  amount = scaledAmount(amount, save, effect.saveEffect);
  if (amount <= 0) return { type: effect.type, ability, amount: 0, save };

  if (effect.type === "abilityDrain") {
    const data = buildNoteEffect({
      ...effect,
      label: effect.label || `${ability.toUpperCase()} drain`,
      text: effect.text || `${ability.toUpperCase()} drain ${amount}. D35E has no exact native drain field exposed to this module, so this is tracked as a called-shot effect note.`
    }, context);
    const created = await createEffect(actor, data, state);
    return { type: "abilityDrain", ability, amount, save, created };
  }

  const path = `system.abilities.${ability}.damage`;
  const current = numberOr(getProperty(actor, path));
  await updateActor(actor, { [path]: current + amount }, state);
  return { type: "abilityDamage", ability, amount, save };
}

async function applyFlag(actor, effect, context, state) {
  const path = `flags.${MODULE_ID}.calledShotState.${effect.key || context.locationId}`;
  const current = getProperty(actor, path);
  const value = effect.value ?? {
    locationId: context.locationId,
    locationLabel: context.locationLabel,
    severity: context.severity,
    label: effect.label ?? effect.key ?? context.locationLabel,
    text: effect.text ?? "",
    appliedAt: new Date().toISOString()
  };
  await updateActor(actor, { [path]: value }, state);
  return { type: "flag", path, previous: current, value };
}

async function applyDeath(actor, effect, context, state) {
  const hpPath = "system.attributes.hp.value";
  const currentHp = numberOr(getProperty(actor, hpPath));
  const update = {
    "system.attributes.conditions.dead": true,
    [hpPath]: Math.min(currentHp, -100)
  };
  await updateActor(actor, update, state);
  await actor.conditions?.toggleConditionStatusIcons?.();
  return { type: "death", update };
}

async function applyNoteLike(actor, effect, context, state, type = effect.type) {
  const data = buildNoteEffect(effect, context);
  const created = await createEffect(actor, data, state);
  return { type, created };
}

async function applySaveBranch(actor, effect, context, state) {
  const save = await rollSave(actor, effect.save, context.saveDc, state, effect.saveKey || effect.label || effect.type);
  const branchContext = { ...context, saveResult: save };
  const branch = save?.success ? effect.onSuccess ?? [] : effect.onFailure ?? [];
  const results = [];
  for (const child of branch) results.push(await applyEffectSpecInternal(actor, child, branchContext, state));
  if (save && !save.success && save.margin <= -5) {
    for (const child of effect.failureBy5 ?? []) results.push(await applyEffectSpecInternal(actor, child, branchContext, state));
  }
  return { type: "saveBranch", save, results };
}

async function applyEffectSpecInternal(actor, effect, context, state) {
  validateEffectSpec(effect);
  if (!shouldApplyByContext(effect, context)) return { type: effect.type, skipped: true };

  if (effect.type === "saveBranch") return applySaveBranch(actor, effect, context, state);

  if (effect.save && ["condition", "note", "activeEffect", "bleed", "speedPenalty", "dropHeld", "flag", "death"].includes(effect.type)) {
    const save = await rollSave(actor, effect.save, context.saveDc, state, effect.saveKey);
    if (save?.success && effect.saveEffect === "negate") return { type: effect.type, skipped: true, save };
    context = { ...context, saveResult: save };
  }

  if (effect.type === "condition") return applyCondition(actor, effect, context, state);
  if (effect.type === "abilityDamage" || effect.type === "abilityDrain") return applyAbilityDamage(actor, effect, context, state);
  if (effect.type === "activeEffect") {
    return createEffect(actor, {
      name: effect.label || context.label || "Called Shot Effect",
      icon: effect.icon || "icons/svg/blood.svg",
      disabled: false,
      duration: effect.duration ?? {},
      changes: Array.isArray(effect.changes) ? effect.changes : [],
      flags: {
        [MODULE_ID]: {
          [FLAGS.calledShotEffect]: {
            locationId: context.locationId,
            severity: context.severity,
            source: "called-shot"
          }
        }
      }
    }, state);
  }
  if (effect.type === "note") return applyNoteLike(actor, effect, context, state, "note");
  if (effect.type === "bleed") {
    return applyNoteLike(actor, {
      ...effect,
      label: effect.label || "Bleed",
      text: effect.text || `${effect.formula ?? effect.amount ?? 1} bleed damage.`
    }, context, state, "bleed");
  }
  if (effect.type === "speedPenalty") {
    return applyNoteLike(actor, {
      ...effect,
      label: effect.label || "Speed penalty",
      text: effect.text || `Speed penalty ${effect.amount ?? ""} for ${effect.durationText ?? "the listed duration"}.`
    }, context, state, "speedPenalty");
  }
  if (effect.type === "dropHeld") {
    return applyNoteLike(actor, {
      ...effect,
      label: effect.label || "Drop held item",
      text: effect.text || "The target drops the held item indicated by the called-shot result."
    }, context, state, "dropHeld");
  }
  if (effect.type === "flag") return applyFlag(actor, effect, context, state);
  if (effect.type === "death") return applyDeath(actor, effect, context, state);

  throw new Error(`Unsupported called shot effect type: ${effect.type}`);
}

function buildLedgerEntry(actor, effects, context) {
  return {
    id: globalThis.foundry?.utils?.randomID?.() ?? `pacs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    appliedAt: new Date().toISOString(),
    actorUuid: actor?.uuid ?? null,
    sourceMessageId: context.messageId ?? context.payload?.messageId ?? null,
    attackerActorId: context.payload?.actorId ?? context.attackerActorId ?? null,
    attackerItemId: context.payload?.itemId ?? context.attackerItemId ?? null,
    locationId: context.locationId ?? context.payload?.locationId ?? null,
    locationLabel: context.locationLabel ?? context.payload?.locationLabel ?? null,
    severity: context.severity ?? null,
    saveDc: context.saveDc ?? null,
    attackTotal: context.attackTotal ?? null,
    finalDamage: cloneData(context.finalDamage ?? null),
    localArmor: cloneData(context.localArmor ?? null),
    effects: cloneData(effects ?? []),
    saves: [],
    actorUpdates: [],
    createdEffects: [],
    results: []
  };
}

export function getCalledShotLedger(actor) {
  const ledger = actorFlag(actor, FLAGS.calledShotLedger, []);
  return Array.isArray(ledger) ? ledger : [];
}

export async function appendCalledShotLedgerEntry(actor, entry) {
  const ledger = [...getCalledShotLedger(actor), entry];
  await setActorFlag(actor, FLAGS.calledShotLedger, ledger);
  return ledger;
}

export async function applyEffectSpec(actor, effect, context = {}) {
  if (!actor) throw new Error("applyEffectSpec requires an actor.");
  const state = {
    saveCache: new Map(),
    ledger: buildLedgerEntry(actor, [effect], context)
  };
  return applyEffectSpecInternal(actor, effect, context, state);
}

export async function applyOutcome(actor, effects, context = {}) {
  if (!actor) throw new Error("applyOutcome requires an actor.");
  const state = {
    saveCache: new Map(),
    ledger: buildLedgerEntry(actor, effects, context)
  };
  for (const effect of effects ?? []) {
    state.ledger.results.push(await applyEffectSpecInternal(actor, effect, context, state));
  }
  await appendCalledShotLedgerEntry(actor, state.ledger);
  return {
    ledgerEntry: state.ledger,
    results: state.ledger.results
  };
}

export async function restoreCalledShotLedgerEntry(actor, entryId) {
  if (!actor) throw new Error("restoreCalledShotLedgerEntry requires an actor.");
  const ledger = getCalledShotLedger(actor);
  let index = entryId ? ledger.findIndex((entry) => entry.id === entryId) : -1;
  if (!entryId) {
    for (let candidate = ledger.length - 1; candidate >= 0; candidate--) {
      if (!ledger[candidate]?.restoredAt) {
        index = candidate;
        break;
      }
    }
  }
  if (index < 0) return null;
  const entry = ledger[index];
  if (entry.restoredAt) return entry;

  const update = {};
  for (const actorUpdate of [...(entry.actorUpdates ?? [])].reverse()) {
    Object.assign(update, actorUpdate.previous ?? {});
  }
  if (Object.keys(update).length) await actor.update(update);

  const effectIds = (entry.createdEffects ?? []).filter(Boolean);
  if (effectIds.length) {
    const existing = effectIds.filter((id) => activeEffectDocument(actor, id));
    if (existing.length) await actor.deleteEmbeddedDocuments?.("ActiveEffect", existing);
  }

  const restored = {
    ...entry,
    restoredAt: new Date().toISOString()
  };
  const nextLedger = [...ledger];
  nextLedger[index] = restored;
  await setActorFlag(actor, FLAGS.calledShotLedger, nextLedger);
  return restored;
}

export async function restoreAllCalledShotLedgerEntries(actor) {
  const restored = [];
  for (const entry of [...getCalledShotLedger(actor)].reverse()) {
    if (!entry.restoredAt) restored.push(await restoreCalledShotLedgerEntry(actor, entry.id));
  }
  return restored.filter(Boolean);
}
