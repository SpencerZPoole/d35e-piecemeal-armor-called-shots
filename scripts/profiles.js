import { ABILITY_KEYS } from "./constants.js";

export function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

export const DEFAULT_CALLED_SHOT_PROFILES = Object.freeze({
  schemaVersion: 1,
  activeProfileId: "pf1e-uc-adapted",
  profiles: [
    {
      id: "pf1e-uc-adapted",
      label: "PF1e Ultimate Combat adapted defaults",
      source: "Pathfinder RPG Ultimate Combat variant rules, adapted for D35E by table configuration.",
      notes: [
        "This is not D&D 3.5 RAW.",
        "Outcome text is deliberately compact and editable so each GM can tune severity."
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
              { type: "note", label: "Arm impaired", text: "Apply an arm-use penalty for a short duration if it matters at the table." }
            ],
            critical: [
              { type: "abilityDamage", ability: "dex", formula: "1d4", save: "Fortitude half, minimum 1" },
              { type: "abilityDamage", ability: "str", formula: "1d4", save: "Fortitude half, minimum 1" },
              { type: "note", label: "Arm impaired", text: "Extend the normal arm penalty to minutes." }
            ],
            debilitating: [
              { type: "abilityDamage", ability: "dex", formula: "1d6", save: "GM adjudication" },
              { type: "abilityDamage", ability: "str", formula: "1d6", save: "GM adjudication" },
              { type: "note", label: "Limb disabled", text: "The limb may be unusable or destroyed depending on the save and table ruling." }
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
              { type: "note", label: "Chest hit", text: "Apply a penalty to immediate skill checks caused by the hit when relevant." }
            ],
            critical: [
              { type: "abilityDamage", ability: "con", formula: "1d4", save: "Fortitude may avoid fatigue" },
              { type: "condition", status: "fatigued", label: "Fatigued" }
            ],
            debilitating: [
              { type: "abilityDamage", ability: "con", formula: "2d4", save: "Fortitude may reduce exhaustion" },
              { type: "condition", status: "exhausted", label: "Exhausted" },
              { type: "note", label: "Internal injury", text: "Track any recurring Constitution damage manually unless your table enables a custom effect." }
            ]
          }
        },
        {
          id: "ear",
          label: "Ear",
          difficulty: "challenging",
          penalty: -10,
          coverageSlot: "head",
          outcomes: {
            normal: [
              { type: "note", label: "Hearing impaired", text: "One ear is impaired briefly; apply perception penalties manually when relevant." }
            ],
            critical: [
              { type: "condition", status: "staggered", label: "Staggered" },
              { type: "note", label: "Deafened ear", text: "Track single-ear deafness as a note unless all hearing is lost." }
            ],
            debilitating: [
              { type: "condition", status: "stunned", label: "Stunned" },
              { type: "condition", status: "staggered", label: "Staggered" },
              { type: "note", label: "Ear destroyed", text: "Track permanent or magical-healing-only hearing loss as a GM note." }
            ]
          }
        },
        {
          id: "eye",
          label: "Eye",
          difficulty: "challenging",
          penalty: -10,
          coverageSlot: "head",
          outcomes: {
            normal: [
              { type: "note", label: "Vision impaired", text: "Apply concealment or perception penalties briefly." }
            ],
            critical: [
              { type: "note", label: "Eye disabled", text: "Track temporary sight loss in the chosen eye." }
            ],
            debilitating: [
              { type: "condition", status: "blind", label: "Blind" },
              { type: "note", label: "Bleeding eye wound", text: "Track bleed or permanent eye loss as configured by the GM." }
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
              { type: "note", label: "Hand impaired", text: "Apply a hand-use penalty or require a held-item check if appropriate." }
            ],
            critical: [
              { type: "abilityDamage", ability: "dex", formula: "1d4", save: "Fortitude half, minimum 1" },
              { type: "note", label: "Grip impaired", text: "Track disarm, dropping, or item-use penalties manually." }
            ],
            debilitating: [
              { type: "abilityDamage", ability: "dex", formula: "1d6", save: "GM adjudication" },
              { type: "note", label: "Hand disabled", text: "The hand may be unusable or destroyed depending on the save and table ruling." }
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
              { type: "note", label: "Head hit", text: "Apply short-lived concentration, perception, or caster disruption notes as needed." }
            ],
            critical: [
              { type: "condition", status: "staggered", label: "Staggered" },
              { type: "note", label: "Head trauma", text: "Apply additional table-specific penalties if configured." }
            ],
            debilitating: [
              { type: "condition", status: "stunned", label: "Stunned" },
              { type: "note", label: "Severe head trauma", text: "Use GM adjudication for unconsciousness or lethal outcomes." }
            ]
          }
        },
        {
          id: "heart",
          label: "Heart",
          difficulty: "near impossible",
          penalty: -20,
          coverageSlot: "torso",
          outcomes: {
            normal: [
              { type: "note", label: "Near miss to heart", text: "Apply no automatic extra effect unless your profile defines one." }
            ],
            critical: [
              { type: "abilityDamage", ability: "con", formula: "1d6", save: "Fortitude partial" },
              { type: "note", label: "Heart wound", text: "Track bleed or death-risk manually." }
            ],
            debilitating: [
              { type: "note", label: "Potentially fatal heart wound", text: "This profile intentionally leaves death or instant-kill rulings to GM confirmation." }
            ]
          }
        },
        {
          id: "leg",
          label: "Leg",
          difficulty: "easy",
          penalty: -2,
          coverageSlot: "legs",
          outcomes: {
            normal: [
              { type: "note", label: "Leg impaired", text: "Apply a movement, climb, jump, or balance penalty briefly." }
            ],
            critical: [
              { type: "abilityDamage", ability: "dex", formula: "1d4", save: "Fortitude half, minimum 1" },
              { type: "condition", status: "prone", label: "Prone" }
            ],
            debilitating: [
              { type: "abilityDamage", ability: "dex", formula: "1d6", save: "GM adjudication" },
              { type: "note", label: "Leg disabled", text: "The leg may be unusable or destroyed depending on the save and table ruling." }
            ]
          }
        },
        {
          id: "neck",
          label: "Neck",
          difficulty: "challenging",
          penalty: -10,
          coverageSlot: "neck",
          outcomes: {
            normal: [
              { type: "note", label: "Voice or breath impaired", text: "Apply speech, breath, or verbal-component disruption if relevant." }
            ],
            critical: [
              { type: "note", label: "Throat wound", text: "Track speech loss, bleed, or breathing trouble manually." }
            ],
            debilitating: [
              { type: "note", label: "Severe neck wound", text: "Suffocation, severing, or death effects require explicit GM adjudication." }
            ]
          }
        },
        {
          id: "vitals",
          label: "Vitals",
          difficulty: "tricky",
          penalty: -5,
          coverageSlot: "torso",
          outcomes: {
            normal: [
              { type: "condition", status: "sickened", label: "Sickened" }
            ],
            critical: [
              { type: "abilityDamage", ability: "con", formula: "1d4", save: "Fortitude partial" },
              { type: "condition", status: "sickened", label: "Sickened" }
            ],
            debilitating: [
              { type: "abilityDamage", ability: "con", formula: "1d6", save: "GM adjudication" },
              { type: "condition", status: "stunned", label: "Stunned" }
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
  if (effect.type === "abilityDamage" && !ABILITY_KEYS.includes(effect.ability)) {
    throw new Error(`Invalid ability damage key: ${effect.ability}`);
  }
  if (effect.type === "condition" && !effect.status) throw new Error("Condition effects need a status.");
  return true;
}
