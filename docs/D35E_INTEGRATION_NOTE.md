# D35E Integration Note

This module is built to sit beside the D35E system instead of replacing it.

## Armor Fields

The native armor profile relies on D35E 3.0.2 equipment fields:

- `system.armor.value`
- `system.armor.enh`
- `system.armor.dex`
- `system.armor.acp`
- `system.spellFailure`
- `system.equipmentType`
- `system.equipmentSubtype`
- `system.slot`

Baseline-only armor remains ordinary D35E armor. Composite piecemeal armor uses a hidden zero-weight, zero-price equipment carrier so D35E can calculate actor AC, armor check penalty, max Dexterity, arcane spell failure, inventory value, and related derived values through its normal equipment pipeline.

The module calculates the profile values before handing them to D35E. D35E still owns the final actor preparation, but the hidden carrier uses worst-piece ACP/ASF/max Dex, complete-suit and mixed-suit adjustments, and D35E-representable material/magic results. Separately enchanted pieces use torso > legs > arms precedence, suit-bound magic requires a complete matching suit ID, and material benefits require all active selected pieces to share the same material. Source items are backed up and neutralized while the profile is active so armor is not counted twice.

The `PAcS Armor Pieces` compendium records are D35E Item documents with explicit module flags for piece category, coverage, armor family, armor bonus, max Dex, ACP, ASF, weight, and cost. They are generated from the same catalog resolver used by runtime armor math. The visible item names are for searchability, while the flags are the integration contract. PAcS slots accept those flagged piece records directly; ordinary full armor items stay in D35E's native `Armor` slot unless the sheet drop handler breaks one suit into flagged PAcS pieces through the confirmation workflow.

## Attack Workflow

Called shots use D35E's native attack dialog and attack math:

- `form.attack-form` receives one additional `Called Shot` select control.
- `ItemUse.prototype.rollAttack` is wrapped to read the submitted location.
- `D35E.ItemUse.preRollAllAttacks` is used to capture the real full-attack sequence before dice roll.
- `ChatAttack.addAttack` is wrapped to inject a D35E attack modifier such as `Called Shot: Ear -10`.
- Melee called-shot range/reach penalties are calculated from token occupied-space adjacency. D35E's native `system.traits.reach` is read as a numeric feet value for context, but reach does not remove the RAW-adapted `-2` penalty when the target is not adjacent.
- `ChatAttack` damage card builders are wrapped to carry called-shot metadata into D35E's stored chat template data.
- `D35E.DamageRoll.preHitCheck` is used to adjust the target AC for called-shot local armor before D35E decides hit or crit.
- `D35E.DamageRoll.hit` and `D35E.DamageRoll.calculateDamage` are observed so the module can determine post-DR severity after D35E resolves the native damage flow.
- `ActorDamageHelper.applyDamage` is wrapped so called-shot outcomes apply, ask for GM confirmation, or stay advisory only after the native Apply Damage action completes.

If D35E changes those methods or class names, check `game.d35ePiecemealCalledShots.getIntegrationStatus()` and the browser console before trusting called-shot roll integration.

## Outcome Ledger

Applied called-shot effects are stored on the target actor under module flags. Ledger entries record actor updates and created ActiveEffect IDs so the GM-facing restore control can reverse an accidental severe outcome without editing D35E system files.
