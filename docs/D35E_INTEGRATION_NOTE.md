# D35E Integration Note

This module is built to sit beside the D35E system instead of replacing it.

## Armor Fields

The piecemeal armor aggregate item relies on D35E 3.0.2 equipment fields:

- `system.armor.value`
- `system.armor.enh`
- `system.armor.dex`
- `system.armor.acp`
- `system.spellFailure`
- `system.equipmentType`
- `system.equipmentSubtype`
- `system.slot`

The aggregate armor item lets D35E calculate actor AC, armor check penalty, max Dexterity, arcane spell failure, and related derived values through its normal equipment pipeline.

In RAW-adapted mode the module calculates the aggregate values before handing them to D35E. D35E still owns the final actor preparation, but the generated item uses worst-piece ACP/ASF/max Dex, complete-suit and mixed-suit adjustments, and D35E-representable material/magic results.

## Attack Workflow

Called shots use D35E's native attack dialog and attack math:

- `form.attack-form` receives one additional `Called Shot` select control.
- `ItemUse.prototype.rollAttack` is wrapped to read the submitted location.
- `D35E.ItemUse.preRollAllAttacks` is used to capture the real full-attack sequence before dice roll.
- `ChatAttack.addAttack` is wrapped to inject a D35E attack modifier such as `Called Shot: Ear -10`.
- `ChatAttack` damage card builders are wrapped to carry called-shot metadata into D35E's stored chat template data.
- `D35E.DamageRoll.preHitCheck` is used to adjust the target AC for called-shot local armor before D35E decides hit or crit.
- `D35E.DamageRoll.hit` and `D35E.DamageRoll.calculateDamage` are observed so the module can determine post-DR severity after D35E resolves the native damage flow.
- `ActorDamageHelper.applyDamage` is wrapped so RAW-adapted outcomes apply only after the native Apply Damage action completes.

If D35E changes those methods or class names, check `game.d35ePiecemealCalledShots.getIntegrationStatus()` and the browser console before trusting called-shot roll integration.

## Outcome Ledger

Automatic called-shot effects are stored on the target actor under module flags. Ledger entries record actor updates and created ActiveEffect IDs so the GM-facing restore control can reverse an accidental severe outcome without editing D35E system files.
