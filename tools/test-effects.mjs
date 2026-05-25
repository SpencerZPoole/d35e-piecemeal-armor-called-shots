import assert from "node:assert/strict";
import {
  applyOutcome,
  getCalledShotLedger,
  restoreAllCalledShotLedgerEntries,
  restoreCalledShotLedgerEntry
} from "../scripts/effects.js";

const MODULE_ID = "d35e-piecemeal-armor-called-shots";

function setProperty(target, path, value) {
  const parts = path.split(".");
  let current = target;
  while (parts.length > 1) {
    const key = parts.shift();
    current[key] ??= {};
    current = current[key];
  }
  current[parts[0]] = value;
}

function actor() {
  return {
    id: "target",
    uuid: "Actor.target",
    system: {
      abilities: {
        con: { damage: 0 },
        dex: { damage: 0 }
      },
      attributes: {
        hp: { value: 20 },
        conditions: { dead: false, fatigued: false },
        savingThrows: {
          fort: { total: 5 },
          ref: { total: 2 },
          will: { total: 0 }
        }
      }
    },
    flags: { [MODULE_ID]: {} },
    effects: [],
    async update(update) {
      for (const [path, value] of Object.entries(update)) setProperty(this, path, value);
    },
    async setFlag(moduleId, key, value) {
      this.flags[moduleId] ??= {};
      this.flags[moduleId][key] = value;
    },
    getFlag(moduleId, key) {
      return this.flags[moduleId]?.[key];
    },
    async createEmbeddedDocuments(_type, documents) {
      const created = documents.map((document, index) => ({
        ...document,
        id: `effect-${this.effects.length + index + 1}`
      }));
      this.effects.push(...created);
      return created;
    },
    async deleteEmbeddedDocuments(_type, ids) {
      this.effects = this.effects.filter((effect) => !ids.includes(effect.id));
    },
    conditions: {
      async toggleConditionStatusIcons() {}
    }
  };
}

const target = actor();
const applied = await applyOutcome(target, [
  { type: "abilityDamage", ability: "con", formula: "1d4", save: "fort", saveEffect: "half", saveKey: "con-half" },
  { type: "condition", status: "fatigued" },
  { type: "bleed", label: "Bleed", formula: "1d6", text: "Bleed is tracked as a note." }
], {
  locationId: "chest",
  locationLabel: "Chest",
  severity: "critical",
  saveDc: 15,
  attackTotal: 15
});

assert.equal(target.system.abilities.con.damage, 1);
assert.equal(target.system.attributes.conditions.fatigued, true);
assert.equal(target.effects.length, 1);
assert.equal(applied.ledgerEntry.saves[0].success, true);
assert.equal(getCalledShotLedger(target).length, 1);

const restored = await restoreCalledShotLedgerEntry(target, applied.ledgerEntry.id);
assert.equal(restored.restoredAt.length > 0, true);
assert.equal(target.system.abilities.con.damage, 0);
assert.equal(target.system.attributes.conditions.fatigued, false);
assert.equal(target.effects.length, 0);

const lethalTarget = actor();
await applyOutcome(lethalTarget, [
  {
    type: "saveBranch",
    save: "fort",
    onSuccess: [{ type: "abilityDamage", ability: "con", formula: "1d6" }],
    onFailure: [{ type: "death", label: "Heart destroyed" }]
  }
], {
  locationId: "heart",
  locationLabel: "Heart",
  severity: "debilitating",
  saveDc: 30
});
assert.equal(lethalTarget.system.attributes.conditions.dead, true);
assert.equal(lethalTarget.system.attributes.hp.value, -100);

const allRestored = await restoreAllCalledShotLedgerEntries(lethalTarget);
assert.equal(allRestored.length, 1);
assert.equal(lethalTarget.system.attributes.conditions.dead, false);
assert.equal(lethalTarget.system.attributes.hp.value, 20);

console.log("test-effects: ok");
