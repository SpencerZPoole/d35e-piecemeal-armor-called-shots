# Architecture

The module is intentionally additive. It does not edit D35E system files, patch actor preparation, or mutate actors on world load.

## Piecemeal Armor

The default v1.2 armor workflow is an actor-level profile presented through D35E's native inventory. The actor's normal D35E `Armor` slot seeds the baseline, and module-owned `PAcS: Torso`, `PAcS: Arms`, and `PAcS: Legs` slots override only the selected category. Known armor names map to catalog pieces; explicit component flags are used for unusual or custom pieces.

When no overrides are active, D35E's native armor item remains the source of truth. When a composite profile is active, the module:

1. Resolves baseline and override items into RAW-adapted armor pieces.
2. Calculates the final armor profile.
3. Stores each source item's native D35E armor fields under a module backup flag.
4. Neutralizes native armor fields on source items so D35E does not double count them.
5. Creates or updates one hidden zero-weight, slotless D35E equipment carrier named `PAcS Armor Profile`.

In RAW-adapted mode, aggregate armor math follows the supplied Ultimate Combat reference as closely as D35E can represent: armor bonuses and weight/cost are summed, a complete arms+legs+torso suit gains `+1`, max Dex/ACP/ASF use worst-piece behavior, mixed complete suits add `+5%` ASF, and separately enchanted pieces use the most protective category for masterwork/enhancement benefit. Legacy mode preserves the older v1.0 summed ACP/ASF/enhancement behavior.

Clearing PAcS slots reverses backed-up fields and removes the hidden carrier when the actor returns to baseline-only or unarmored native behavior. The old visible `Piecemeal Armor Aggregate` path remains behind the `Legacy aggregate sync` setting for older worlds.

## Called Shots

Called-shot profiles are stored as a world setting. The active profile supplies enabled locations, attack penalties, coverage slots, and outcome effects.

The native workflow has three integration points:

1. The module listens for D35E attack dialog rendering and injects one `Called Shot` selector into `form.attack-form`.
2. The module wraps `ItemUse.prototype.rollAttack` so the selected form value is parsed before D35E starts the roll.
3. The module wraps `ChatAttack.addAttack` so the selected penalty is added to D35E's native attack modifiers for the next relevant attack.

For full attacks, `D35E.ItemUse.preRollAllAttacks` is used to observe the real attack labels. In RAW-adapted mode, D35E Full Attack called shots are gated by `Improved Called Shot` and `Greater Called Shot`. Legacy mode keeps the v1.0 policy choices: ask per attack, first generated attack, every generated attack, or none.

Fast-forward attacks keep D35E's no-dialog behavior and do not show called-shot UI.

## Effects

Effect specs are small declarative objects. v1.1 supports D35E conditions, ability damage, generic ActiveEffects, note ActiveEffects, save branches, death, and ledger-backed flags/notes for outcomes D35E does not expose as exact native fields.

The chat card does not decide hit outcome. In RAW-adapted mode, D35E Apply Damage is the boundary: after D35E calculates hit, crit, and post-DR damage, the module chooses normal, critical, or debilitating severity and applies the configured effects. Legacy mode keeps manual GM severity buttons.

Every automatic outcome writes a target actor ledger entry with source context, saves, actor updates, and created ActiveEffect IDs. The actor sheet restore control reverses recorded updates and removes created ActiveEffects, so lethal and permanent automation remains recoverable.
