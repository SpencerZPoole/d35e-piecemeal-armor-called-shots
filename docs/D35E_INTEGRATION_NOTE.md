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

## Attack Workflow

Called shots use D35E's native attack dialog and attack math:

- `form.attack-form` receives one additional `Called Shot` select control.
- `ItemUse.prototype.rollAttack` is wrapped to read the submitted location.
- `D35E.ItemUse.preRollAllAttacks` is used to capture the real full-attack sequence before dice roll.
- `ChatAttack.addAttack` is wrapped to inject a D35E attack modifier such as `Called Shot: Ear -10`.

If D35E changes those methods or class names, check `game.d35ePiecemealCalledShots.getIntegrationStatus()` and the browser console before trusting called-shot roll integration.
