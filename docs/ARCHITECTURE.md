# Architecture

The module is intentionally additive. It does not edit D35E system files, patch actor preparation, or mutate actors on world load.

## Piecemeal Armor

Equipment items can be flagged as piecemeal armor components. A GM-controlled sync action:

1. Reads equipped component flags.
2. Calculates an aggregate armor profile.
3. Creates or updates one D35E equipment item named `Piecemeal Armor Aggregate`.
4. Stores each component item's native D35E armor fields under a module backup flag.
5. Neutralizes native armor fields on the component items so D35E does not double count them.

Restore reverses the backed-up fields and removes the aggregate item.

## Called Shots

Called-shot profiles are stored as a world setting. The active profile supplies enabled locations, attack penalties, coverage slots, and GM-confirmed outcome effects.

The native workflow has three integration points:

1. The module listens for D35E attack dialog rendering and injects one `Called Shot` selector into `form.attack-form`.
2. The module wraps `ItemUse.prototype.rollAttack` so the selected form value is parsed before D35E starts the roll.
3. The module wraps `ChatAttack.addAttack` so the selected penalty is added to D35E's native attack modifiers for the next relevant attack.

For full attacks, `D35E.ItemUse.preRollAllAttacks` is used to observe the real attack labels. The default mode opens one picker before dice roll and queues one optional location per generated attack. Other modes apply the selected location to the first generated attack, every generated attack, or none.

Fast-forward attacks keep D35E's no-dialog behavior and do not show called-shot UI.

## Effects

Effect specs are small declarative objects. v1 supports D35E conditions, ability damage, generic ActiveEffects, and note ActiveEffects. More precise table automation should be expressed as profile data, not hard-coded module policy.

The chat card does not decide hit outcome. The GM chooses normal, critical, or debilitating severity and confirms effect application.
