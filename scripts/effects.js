import { ABILITY_KEYS, FLAGS, MODULE_ID } from "./constants.js";
import { validateEffectSpec } from "./profiles.js";

function getProperty(source, path) {
  if (!source || !path) return undefined;
  if (globalThis.foundry?.utils?.getProperty) return foundry.utils.getProperty(source, path);
  return path.split(".").reduce((current, key) => current?.[key], source);
}

async function rollFormula(formula) {
  if (!formula) return 0;
  if (globalThis.Roll) {
    const roll = await new Roll(formula).evaluate();
    return Number(roll.total) || 0;
  }
  const match = String(formula).trim().match(/^(\d*)d(\d+)$/i);
  if (!match) return Number(formula) || 0;
  const count = Number(match[1] || 1);
  const sides = Number(match[2]);
  return count * Math.ceil(sides / 2);
}

function buildNoteEffect(effect, context) {
  return {
    name: effect.label || context.label || "Called Shot Effect",
    icon: effect.icon || "icons/svg/blood.svg",
    disabled: false,
    duration: {},
    changes: [],
    flags: {
      [MODULE_ID]: {
        [FLAGS.calledShotEffect]: {
          locationId: context.locationId,
          severity: context.severity,
          text: effect.text || "",
          source: "called-shot"
        }
      }
    }
  };
}

export async function applyEffectSpec(actor, effect, context = {}) {
  validateEffectSpec(effect);
  if (!actor) throw new Error("applyEffectSpec requires an actor.");

  if (effect.type === "condition") {
    const update = { [`system.attributes.conditions.${effect.status}`]: true };
    await actor.update(update);
    await actor.conditions?.toggleConditionStatusIcons?.();
    return { type: "condition", status: effect.status, update };
  }

  if (effect.type === "abilityDamage") {
    if (!ABILITY_KEYS.includes(effect.ability)) throw new Error(`Invalid ability key: ${effect.ability}`);
    const current = Number(getProperty(actor, `system.abilities.${effect.ability}.damage`) ?? 0);
    const amount = await rollFormula(effect.formula);
    const update = { [`system.abilities.${effect.ability}.damage`]: current + amount };
    await actor.update(update);
    return { type: "abilityDamage", ability: effect.ability, amount, update };
  }

  if (effect.type === "activeEffect") {
    const data = {
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
    };
    await actor.createEmbeddedDocuments("ActiveEffect", [data]);
    return { type: "activeEffect", data };
  }

  if (effect.type === "note") {
    const data = buildNoteEffect(effect, context);
    await actor.createEmbeddedDocuments("ActiveEffect", [data]);
    return { type: "note", data };
  }

  throw new Error(`Unsupported called shot effect type: ${effect.type}`);
}

export async function applyOutcome(actor, effects, context = {}) {
  const results = [];
  for (const effect of effects ?? []) {
    results.push(await applyEffectSpec(actor, effect, context));
  }
  return results;
}
