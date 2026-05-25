import { ABILITY_KEYS } from "./constants.js";

const EFFECT_TYPES = Object.freeze([
  "activeEffect",
  "abilityDamage",
  "abilityDrain",
  "bleed",
  "condition",
  "death",
  "dropHeld",
  "flag",
  "note",
  "saveBranch",
  "speedPenalty"
]);

function note(label, text, extra = {}) {
  return { type: "note", label, text, ...extra };
}

function flag(key, label, text, value = true) {
  return { type: "flag", key, label, text, value };
}

function condition(status, label = status, extra = {}) {
  return { type: "condition", status, label, ...extra };
}

function damage(ability, formula, extra = {}) {
  return { type: "abilityDamage", ability, formula, ...extra };
}

function drain(ability, formula, extra = {}) {
  return { type: "abilityDrain", ability, formula, ...extra };
}

function bleed(label, formula, text, extra = {}) {
  return { type: "bleed", label, formula, text, ...extra };
}

function saveBranch(save, onSuccess, onFailure, extra = {}) {
  return { type: "saveBranch", save, onSuccess, onFailure, ...extra };
}

export function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

export const DEFAULT_CALLED_SHOT_PROFILES = Object.freeze({
  schemaVersion: 2,
  activeProfileId: "pf1e-uc-raw-adapted",
  profiles: [
    {
      id: "pf1e-uc-raw-adapted",
      label: "PF1e Ultimate Combat RAW-adapted defaults",
      source: "Pathfinder RPG Ultimate Combat variant rules, pages 193-205, adapted for D35E by table configuration.",
      notes: [
        "This is not D&D 3.5 RAW.",
        "The module automates outcomes where D35E exposes a safe native field and records the rest as reversible actor notes and flags.",
        "Use the outcome automation setting to ask the GM before severe effects, apply effects automatically, or keep outcomes advisory only."
      ],
      locations: [
        {
          id: "arm",
          label: "Arm or Wing",
          difficulty: "easy",
          penalty: -2,
          coverageSlot: "arms",
          outcomes: {
            normal: [
              note("Arm impaired", "-2 on attacks, ability checks, and skill checks using the wounded arm for 1d4 rounds. Flying creatures struck in a wing may need a Fly check.")
            ],
            critical: [
              damage("dex", "1d4", { save: "fort", saveEffect: "half", saveKey: "arm-critical" }),
              damage("str", "1d4", { save: "fort", saveEffect: "half", saveKey: "arm-critical" }),
              note("Arm impaired", "The normal arm penalty lasts 1d4 minutes.")
            ],
            debilitating: [
              damage("dex", "1d6"),
              damage("str", "1d6"),
              saveBranch("fort", [
                note("Arm wounded", "The arm remains usable but suffers the normal arm called-shot effect for 2d6 minutes.")
              ], [
                flag("arm-useless", "Arm useless", "The arm is useless until healed for damage equal to the called-shot damage.")
              ], {
                failureBy5: [
                  flag("arm-severed", "Arm severed or mangled", "Only regeneration or a similar effect repairs this arm.")
                ]
              })
            ]
          }
        },
        {
          id: "chest",
          label: "Chest",
          difficulty: "easy",
          penalty: -2,
          coverageSlot: "torso",
          outcomes: {
            normal: [
              note("Chest hit", "-2 on skill checks caused by the hit, such as balancing or climbing after the impact.")
            ],
            critical: [
              damage("con", "1d4"),
              condition("fatigued", "Fatigued", { save: "fort", saveEffect: "negate", saveKey: "chest-critical" }),
              note("Chest hit", "The target also suffers the normal chest called-shot effect.")
            ],
            debilitating: [
              damage("con", "2d4"),
              saveBranch("fort", [
                condition("fatigued", "Fatigued")
              ], [
                condition("exhausted", "Exhausted")
              ], {
                failureBy5: [
                  flag("chest-internal-injury", "Internal injury", "The target takes 1 Con damage in any round it takes a standard action until healed by DC 25 Heal or healing equal to the blow's damage.")
                ]
              })
            ]
          }
        },
        {
          id: "ear",
          label: "Ear",
          difficulty: "challenging",
          penalty: -10,
          coverageSlot: "head; ears",
          outcomes: {
            normal: [
              note("Ear deafened", "One ear is deafened for 1 round and the target takes -2 on Perception checks.")
            ],
            critical: [
              condition("staggered", "Staggered"),
              note("Ear deafened", "One ear is deafened for 2d6 minutes; the target also suffers the normal ear effect for that duration.")
            ],
            debilitating: [
              saveBranch("fort", [
                condition("deaf", "Deaf"),
                flag("ear-destroyed", "Ear destroyed", "The ear is destroyed and hearing remains damaged until remove blindness/deafness or a similar effect.")
              ], [
                condition("stunned", "Stunned"),
                condition("staggered", "Staggered"),
                condition("deaf", "Deaf"),
                flag("ear-destroyed", "Ear destroyed", "The ear is destroyed until remove blindness/deafness or a similar effect.")
              ])
            ]
          }
        },
        {
          id: "eye",
          label: "Eye",
          difficulty: "challenging",
          penalty: -10,
          coverageSlot: "head; eyes",
          outcomes: {
            normal: [
              note("Vision impaired", "Foes have concealment against the target's attacks for 1 round and the target takes -2 on Perception. A creature with only one functional eye is blinded for 1 round instead.")
            ],
            critical: [
              flag("eye-disabled", "Eye disabled", "The target loses sight in the chosen eye for 1d4 minutes."),
              note("Vision impaired", "The target also suffers the normal eye called-shot effect for that duration.")
            ],
            debilitating: [
              saveBranch("ref", [
                flag("eye-disabled", "Eye disabled", "The target loses sight in the chosen eye for 1d4 hours; no bleed is applied.")
              ], [
                condition("blind", "Blind"),
                bleed("Eye bleed", "1d6", "The destroyed eye causes 1d6 bleed damage."),
                flag("eye-destroyed", "Eye destroyed", "The eye is destroyed until remove blindness/deafness or a similar effect.")
              ])
            ]
          }
        },
        {
          id: "hand",
          label: "Hand",
          difficulty: "tricky",
          penalty: -5,
          coverageSlot: "hands",
          outcomes: {
            normal: [
              note("Hand impaired", "-2 on attacks, damage rolls, ability checks, and skill checks using the wounded hand for 1d4 rounds; -4 CMD against disarm; natural 1 drops the weapon.")
            ],
            critical: [
              damage("dex", "1d4"),
              saveBranch("ref", [
                note("Grip retained", "The target keeps hold of items, but still suffers the normal hand effect for 1d4 minutes.")
              ], [
                { type: "dropHeld", label: "Drop held item", text: "The target drops anything held in the wounded hand unless held in two hands." }
              ])
            ],
            debilitating: [
              damage("dex", "1d6"),
              { type: "dropHeld", label: "Drop held item", text: "Anything held in the wounded hand is dropped, including two-handed items." },
              saveBranch("ref", [
                note("Hand wounded", "The hand remains usable but suffers the normal hand effect for 2d6 minutes.")
              ], [
                flag("hand-useless", "Hand useless", "The hand is useless until healed for damage equal to the called-shot damage.")
              ], {
                failureBy5: [
                  flag("hand-severed", "Hand severed or mangled", "Only regeneration or a similar effect repairs this hand.")
                ]
              })
            ]
          }
        },
        {
          id: "head",
          label: "Head",
          difficulty: "tricky",
          penalty: -5,
          coverageSlot: "head",
          outcomes: {
            normal: [
              condition("sickened", "Sickened")
            ],
            critical: [
              { type: "abilityDamage", abilities: ["int", "wis", "cha"], formula: "1d6" },
              condition("staggered", "Staggered", { save: "fort", saveEffect: "negate", saveKey: "head-critical" }),
              note("Head trauma", "The target also suffers the normal head called-shot effect for 1d4 minutes.")
            ],
            debilitating: [
              damage("int", "1d6"),
              damage("wis", "1d6"),
              damage("cha", "1d6"),
              saveBranch("fort", [
                condition("staggered", "Staggered"),
                note("Head trauma", "The target is staggered for 1d10 rounds instead of being knocked unconscious.")
              ], [
                condition("unconscious", "Unconscious")
              ], {
                failureBy5: [
                  flag("head-feeblemind-trauma", "Severe brain trauma", "The target is senseless as feeblemind until heal, greater restoration, or a similar effect.")
                ]
              }),
              note("Head trauma", "The target also suffers the normal head called-shot effect for 2d6 minutes.")
            ]
          }
        },
        {
          id: "heart",
          label: "Heart",
          difficulty: "challenging",
          penalty: -10,
          coverageSlot: "torso; chest; vitals; heart",
          outcomes: {
            normal: [
              note("Heart called shot", "A non-critical, non-debilitating heart called shot has no extra effect beyond the normal hit.")
            ],
            critical: [
              saveBranch("fort", [
                condition("fatigued", "Fatigued"),
                bleed("Constitution bleed", "1", "The heart wound causes 1 point of Constitution bleed until the listed healing requirement is met.")
              ], [
                condition("exhausted", "Exhausted"),
                bleed("Constitution bleed", "1d4", "The heart wound causes 1d4 Constitution bleed until the listed healing requirement is met.")
              ]),
              note("Heart wound healing", "Stopping the bleeding requires regeneration, magic healing equal to the original blow's damage, or a DC 20 Heal check taking 1d4 rounds.")
            ],
            debilitating: [
              saveBranch("fort", [
                condition("exhausted", "Exhausted"),
                damage("con", "1d6"),
                bleed("Constitution bleed", "1d4", "The target suffers 1d4 Constitution bleed.")
              ], [
                { type: "death", label: "Heart destroyed", text: "The target is instantly killed if it relies on its heart to survive." },
                flag("heart-destroyed", "Heart destroyed", "The heart is destroyed.")
              ])
            ]
          }
        },
        {
          id: "leg",
          label: "Leg",
          difficulty: "easy",
          penalty: -2,
          coverageSlot: "legs; feet",
          outcomes: {
            normal: [
              { type: "speedPenalty", amount: -10, durationText: "1d4 rounds", label: "Leg slowed", text: "Speed is reduced by 10 feet for creatures with two or fewer legs, or 5 feet with three or four legs, minimum 5 feet. Movement checks take -2 for 1d4 rounds." }
            ],
            critical: [
              damage("dex", "1d4"),
              condition("prone", "Prone", { save: "fort", saveEffect: "negate", saveKey: "leg-critical" }),
              { type: "speedPenalty", amount: -10, durationText: "1d4 minutes", label: "Leg slowed", text: "The target also suffers the normal leg called-shot effect for 1d4 minutes." }
            ],
            debilitating: [
              condition("prone", "Prone"),
              saveBranch("fort", [
                flag("leg-lamed", "Leg lamed", "The target moves at half speed until the leg is healed or a DC 20 Heal check succeeds.")
              ], [
                flag("leg-useless", "Leg useless", "The leg is useless until healed for damage equal to the called-shot damage.")
              ], {
                failureBy5: [
                  flag("leg-severed", "Leg severed or mangled", "Only regeneration or a similar effect repairs this leg.")
                ]
              }),
              note("Leg trauma", "If enough legs are useless or severed, the target cannot stand and must crawl.")
            ]
          }
        },
        {
          id: "neck",
          label: "Neck",
          difficulty: "challenging",
          penalty: -10,
          coverageSlot: "neck; throat",
          outcomes: {
            normal: [
              note("Voice impaired", "The target cannot speak above a hoarse whisper for 1 round. Verbal spells and command-word items have a 20% failure chance.")
            ],
            critical: [
              bleed("Neck bleed", "1d6", "The neck wound deals 1d6 bleed damage."),
              saveBranch("fort", [
                note("Throat wounded", "The target still suffers the normal neck called-shot effect for 1d4 minutes.")
              ], [
                flag("crushed-windpipe", "Crushed windpipe", "The target cannot breathe or speak and may suffocate until repaired by the listed healing.")
              ]),
              note("Windpipe repair", "A crushed windpipe can be repaired by magical healing equal to the hit damage or a DC 25 Heal check that opens an airway and deals 2d6 damage.")
            ],
            debilitating: [
              saveBranch("fort", [
                bleed("Hit point bleed", "2d6", "The target takes 2d6 bleed damage and cannot speak or breathe for 1d4 minutes.")
              ], [
                bleed("Constitution bleed", "1d4", "The target takes 1d4 Constitution bleed and cannot speak or breathe.")
              ]),
              flag("neck-suffocation-risk", "Cannot speak or breathe", "Track suffocation and healing requirements from the called-shot ledger.")
            ]
          }
        },
        {
          id: "vitals",
          label: "Vitals",
          difficulty: "tricky",
          penalty: -5,
          coverageSlot: "torso; chest; vitals",
          outcomes: {
            normal: [
              condition("sickened", "Sickened"),
              note("Vitals hit", "Sickened duration is 1d4 rounds, reduced to 1 round on a successful Fortitude save; while sickened by this blow, the target cannot run or charge.")
            ],
            critical: [
              damage("con", "1d4"),
              flag("vitals-nauseated", "Nauseated", "The target is nauseated for 1d4 rounds unless the Fortitude save succeeds, and sickened for 1d6 minutes."),
              condition("sickened", "Sickened")
            ],
            debilitating: [
              saveBranch("fort", [
                damage("con", "1d6"),
                flag("vitals-nauseated", "Nauseated", "The Fortitude save reduces the Constitution drain to damage and nausea to 1 round.")
              ], [
                drain("con", "1d6"),
                flag("vitals-nauseated", "Nauseated", "The target is nauseated for 1d4 rounds and sickened for 2d6 minutes."),
                condition("sickened", "Sickened")
              ], {
                failureBy5: [
                  flag("vitals-disemboweled", "Disemboweled", "The target is horrifically wounded."),
                  bleed("Constitution bleed", "1", "The target takes 1 point of Constitution bleed until regeneration, sufficient magical healing, or a DC 20 Heal check.")
                ]
              })
            ]
          }
        }
      ]
    }
  ]
});

export function getDefaultCalledShotProfiles() {
  return cloneData(DEFAULT_CALLED_SHOT_PROFILES);
}

export function normalizeCalledShotProfiles(value) {
  const profiles = typeof value === "string" ? JSON.parse(value) : cloneData(value ?? DEFAULT_CALLED_SHOT_PROFILES);
  if (!Array.isArray(profiles.profiles) || profiles.profiles.length === 0) {
    throw new Error("Called shot profiles must include a non-empty profiles array.");
  }

  const ids = new Set();
  for (const profile of profiles.profiles) {
    if (!profile?.id || ids.has(profile.id)) throw new Error("Each called shot profile needs a unique id.");
    ids.add(profile.id);
    if (!Array.isArray(profile.locations) || profile.locations.length === 0) {
      throw new Error(`Profile ${profile.id} needs at least one location.`);
    }

    const locationIds = new Set();
    for (const location of profile.locations) {
      if (!location?.id || locationIds.has(location.id)) throw new Error(`Profile ${profile.id} has an invalid location id.`);
      locationIds.add(location.id);
      const penalty = Number(location.penalty);
      if (!Number.isFinite(penalty) || penalty > 0) throw new Error(`Location ${location.id} needs a zero or negative penalty.`);
      for (const severity of ["normal", "critical", "debilitating"]) {
        if (!Array.isArray(location.outcomes?.[severity])) {
          throw new Error(`Location ${location.id} needs a ${severity} outcome array.`);
        }
      }
      if (location.enabled === undefined) location.enabled = true;
    }
  }

  if (!profiles.activeProfileId || !ids.has(profiles.activeProfileId)) {
    profiles.activeProfileId = profiles.profiles[0].id;
  }
  return profiles;
}

export function getActiveProfile(profiles) {
  const normalized = normalizeCalledShotProfiles(profiles);
  return normalized.profiles.find((profile) => profile.id === normalized.activeProfileId) ?? normalized.profiles[0];
}

export function getLocation(profile, locationId) {
  return profile?.locations?.find((location) => location.id === locationId) ?? null;
}

export function getEnabledLocations(profile) {
  return (profile?.locations ?? []).filter((location) => location.enabled !== false);
}

export function validateEffectSpec(effect) {
  if (!effect || typeof effect !== "object") throw new Error("Effect spec must be an object.");
  if (!effect.type) throw new Error("Effect spec needs a type.");
  if (!EFFECT_TYPES.includes(effect.type)) throw new Error(`Unsupported effect type: ${effect.type}`);
  if ((effect.type === "abilityDamage" || effect.type === "abilityDrain") && effect.ability && !ABILITY_KEYS.includes(effect.ability)) {
    throw new Error(`Invalid ability key: ${effect.ability}`);
  }
  if ((effect.type === "abilityDamage" || effect.type === "abilityDrain") && effect.abilities) {
    if (!Array.isArray(effect.abilities) || !effect.abilities.every((ability) => ABILITY_KEYS.includes(ability))) {
      throw new Error("Ability choice effects need valid ability keys.");
    }
  }
  if (effect.type === "condition" && !effect.status) throw new Error("Condition effects need a status.");
  if (effect.type === "saveBranch") {
    if (!effect.save) throw new Error("Save branch effects need a save.");
    if (!Array.isArray(effect.onSuccess) || !Array.isArray(effect.onFailure)) {
      throw new Error("Save branch effects need onSuccess and onFailure arrays.");
    }
    for (const child of [...effect.onSuccess, ...effect.onFailure, ...(effect.failureBy5 ?? [])]) validateEffectSpec(child);
  }
  return true;
}
