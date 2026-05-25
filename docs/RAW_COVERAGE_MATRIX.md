# RAW Coverage Matrix

| Area | Status | Notes |
| --- | --- | --- |
| D&D 3.5 piecemeal armor RAW | Not claimed | No canonical 3.5 subsystem is bundled. |
| D&D 3.5 called shots RAW | Not claimed | No canonical 3.5 subsystem is bundled. |
| PF1e piecemeal armor | RAW-adapted default | Uses the supplied Ultimate Combat rules for piece categories, complete suits, worst ACP/ASF/max Dex, mixed-suit ASF, hasty donning, mithral, and magic/masterwork precedence where D35E can represent the result. |
| PF1e called shots | RAW-adapted default | Uses Ultimate Combat Table 5-4 penalties, feat-gated full attacks, severity thresholds, saves, DR-negated no-effect behavior, and automatic outcome specs. |
| D35E armor math | Automated through native inventory slots | Baseline-only armor stays native in D35E's `Armor` slot. Composite profiles use hidden slotless carrier math plus visible `PAcS: Torso`, `PAcS: Arms`, and `PAcS: Legs` inventory slots. |
| Local armor AC | Automated in Apply Damage | Called-shot locations can replace the active profile's armor contribution with matching piece coverage. Touch called shots are checked against normal AC. |
| Called-shot hit adjudication | Automated after Apply Damage | D35E determines hit/crit and post-DR damage; the module determines severity from that result. |
| Severe called-shot effects | Automated with restore ledger | Death, severing/maiming flags, suffocation notes, bleed notes, conditions, and ability damage/drain are applied or recorded, then recoverable by a GM restore control. |
| Legacy v1.0 behavior | Opt-in setting | Legacy mode preserves permissive full attacks and manual outcome buttons for existing tables. |

## Adaptation Boundaries

- The module still does not claim piecemeal armor or called shots are official D&D 3.5 RAW.
- D35E has native fields for conditions, ability damage, armor AC, max Dex, ACP, ASF, speed category, weight, and item state.
- D35E does not expose exact native fields for every Ultimate Combat consequence. The module records those as explicit actor flags or ActiveEffect notes.
- Cover/concealment and automatic-hit suppression are best-effort module-side hooks. If D35E or another module bypasses the normal attack and Apply Damage path, no called-shot automation is applied.
