# RAW Coverage Matrix

| Area | Status | Notes |
| --- | --- | --- |
| D&D 3.5 piecemeal armor RAW | Not claimed | No canonical 3.5 subsystem is bundled. |
| D&D 3.5 called shots RAW | Not claimed | No canonical 3.5 subsystem is bundled. |
| PF1e piecemeal armor | RAW-adapted default | Uses the supplied Ultimate Combat rules for piece categories, complete suits, worst ACP/ASF/max Dex, mixed-suit ASF, hasty donning, mithral, and magic/masterwork precedence where D35E can represent the result. |
| PF1e called shots | RAW-adapted default | Uses Ultimate Combat Table 5-4 penalties, feat-gated full attacks, severity thresholds, saves, DR-negated no-effect behavior, and automatic outcome specs. |
| Called-shot range/reach | RAW-adapted default | Melee called shots add `-2` when the target is not adjacent, even if the attacker has reach. Ranged called shots double range-increment penalties, with at least `-2` beyond 30 feet. |
| D35E armor math | Automated through native inventory slots | Baseline-only armor stays native in D35E's `Armor` slot. Composite profiles use hidden slotless carrier math plus visible `PAcS: Torso`, `PAcS: Arms`, and `PAcS: Legs` inventory slots. |
| PAcS armor piece items | D35E-calibrated convenience pack | The `PAcS Armor Pieces` compendium ships ready-to-use torso, arm, and leg override items generated from the calibrated catalog. The pack improves onboarding but does not create a separate rules source. |
| Local armor AC | Automated in Apply Damage | Called-shot locations can replace the active profile's armor contribution with matching piece coverage. Exposed locations use local armor `0`. Touch called shots are checked against normal AC. |
| Helmet head coverage | Optional house rule | Disabled by default. Configured D35E `Head` slot helmets can supply their own local Head/Eye/Ear armor only; they do not change total AC or RAW piecemeal suit math. Bundled starter values use the matching D35E full armor bonus and remain editable for grittier tables. |
| Called-shot hit adjudication | Automated after Apply Damage | D35E determines hit/crit and post-DR damage; the module determines severity from that result. |
| Severe called-shot effects | Configurable with restore ledger | Death, severing/maiming flags, suffocation notes, bleed notes, conditions, and ability damage/drain can be applied automatically, confirmed by the GM first, or kept advisory only, then recoverable by a GM restore control when applied. |
| Older v1.0 behavior | Migration-only support | Old aggregate and advisory helpers are retained internally for older actors and tests, but the normal settings menu uses the native inventory workflow and the clearer outcome automation setting. |

## D35E-Calibrated Armor Catalog

The module uses PF1e piecemeal armor structure, but the starter armor catalog is calibrated for D35E/D&D 3.5e armor bonuses. For a complete three-category suit, the rule is:

`torso armor + arm armor + leg armor + full-suit bonus 1 = normal D&D 3.5e armor bonus`

That means some bundled piece armor values intentionally differ from Ultimate Combat. This keeps a D35E character wearing a complete catalog suit at the same armor AC as the normal 3.5e armor item, while preserving the piecemeal mechanic for swaps, local armor, and mixed suits. This is still optional-rule automation: it is not exact Pathfinder RAW, and it is not official D&D 3.5 RAW.

The `PAcS Armor Pieces` compendium is generated from this same catalog and suit mapping. Item display names are written for player searchability, such as `[PAcS] Full Plate, Torso` or `[PAcS] Half-Plate, Legs`, while their flags keep the actual mapped piece category and armor family. This is why some display items share values with an underlying family piece: `[PAcS] Full Plate, Torso` uses the calibrated plate torso values, and `[PAcS] Half-Plate, Legs` uses the chain leg values required by the half-plate suit mapping.

| Armor | D&D 3.5e target | Torso | Arms | Legs | Suit +1 | Notes |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Padded | 1 | 0 | 0 | 0 | 1 | Complete suit closes to padded armor. |
| Leather | 2 | 1 | 0 | 0 | 1 | Complete suit closes to leather armor. |
| Studded leather | 3 | 1 | 0 | 1 | 1 | Complete suit closes to studded leather armor. |
| Hide | 3 | 2 | 0 | 0 | 1 | Legs are lower than the PF-derived starter value. |
| Scale mail | 4 | 2 | 1 | 0 | 1 | Added catalog family. |
| Chain shirt | 4 | 4 | n/a | n/a | n/a | Torso-only item; no suit bonus by itself. |
| Chainmail | 5 | 3 | 1 | 0 | 1 | Split from chain shirt mapping. |
| Breastplate | 5 | 5 | n/a | n/a | n/a | Torso-only plate item; no suit bonus by itself. |
| Banded mail | 6 | 4 | 1 | 0 | 1 | Added catalog family. |
| Splint mail | 6 | 4 | 1 | 0 | 1 | Added catalog family. |
| Half-plate | 7 | 5 | 1 | 0 | 1 | Plate torso plus plate arms plus chain legs. |
| Full plate | 8 | 5 | 1 | 1 | 1 | Plate torso is lower than the PF-derived starter value. |

## Adaptation Boundaries

- The module still does not claim piecemeal armor or called shots are official D&D 3.5 RAW.
- D35E has native fields for conditions, ability damage, armor AC, max Dex, ACP, ASF, speed category, weight, and item state.
- D35E does not expose exact native fields for every Ultimate Combat consequence. The module records those as explicit actor flags or ActiveEffect notes.
- Cover/concealment and automatic-hit suppression are best-effort module-side hooks. If D35E or another module bypasses the normal attack and Apply Damage path, no called-shot automation is applied.
