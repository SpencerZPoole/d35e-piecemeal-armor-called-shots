# Architecture

The module is intentionally additive. It does not edit D35E system files, patch actor preparation, or mutate actors on world load.

## Piecemeal Armor

The default armor workflow is an actor-level profile presented through D35E's native inventory. The actor's normal D35E `Armor` slot seeds the baseline, and module-owned `PAcS: Torso`, `PAcS: Arms`, and `PAcS: Legs` slots override only the selected category. Known armor names map to catalog pieces for baselines and legacy recovery; direct PAcS slot assignment now requires explicit component flags so full suits are not treated as one physical piece.

The `PAcS Armor Pieces` Item compendium is generated from the same calibrated catalog and suit mapping. It is an onboarding and data-entry aid, not a separate rules table. Display names stay user-searchable, such as `[PAcS] Half-Plate, Legs`, while flags retain the mapped category, armor family, coverage, and piece statistics. Explicit pack pieces are category-locked: a leg piece dropped on `PAcS: Arms` is rejected with a clear warning instead of being silently reinterpreted. Recognized full suits dropped onto a PAcS slot go through a UI breakdown confirmation that consumes one suit, creates matching PAcS piece records, and assigns only the requested category.

When no overrides are active, D35E's native armor item remains the source of truth. When a composite profile is active, the module:

1. Resolves baseline and override items into RAW-adapted armor pieces.
2. Calculates the final armor profile.
3. Stores each source item's native D35E armor fields under a module backup flag.
4. Neutralizes native armor fields on source items so D35E does not double count them.
5. Creates or updates one hidden zero-weight, zero-price, slotless D35E equipment carrier named `PAcS Armor Profile`.

Aggregate armor math follows the supplied Ultimate Combat reference as closely as D35E can represent: armor bonuses and weight/cost are summed, a complete arms+legs+torso suit gains `+1`, max Dex/ACP/ASF use worst-piece behavior, mixed complete suits add `+5%` ASF, separately enchanted pieces use the most protective category for masterwork/enhancement benefit, and suit-bound magic applies only when the complete active suit shares one suit ID. Special material automation is all-active-piece gated; mithral changes max Dex, ACP, ASF, and subtype only when every active selected piece is mithral. The bundled catalog is D35E-calibrated, so complete catalog suits close to normal D&D 3.5e armor bonuses after that `+1` instead of copying PF1e armor totals exactly. The old v1.0 summed ACP/ASF/enhancement behavior remains available only through internal compatibility helpers and tests.

Clearing PAcS slots reverses backed-up fields and removes the hidden carrier when the actor returns to baseline-only or unarmored native behavior. The old visible `Piecemeal Armor Aggregate` path is retained only as migration and recovery support for older worlds.

## Called-Shot AC House Rules And Helmet Skill Penalties

Called shots use normal applicable AC by default. The disabled-by-default exposed headshot and exposed hand-shot settings are separate house rules, not PF1e RAW and not a fourth piecemeal armor category. Exposed Head/Eye/Ear and Hand use the same effective native-slot coverage map as local armor. By default, Eye can be covered by Eyes, Head, or Headband; Head/Ear by Head or Headband; and Hand by Hands or Wrists. If the mapped native slots are empty, the pre-hit hook subtracts the active armor/profile armor contribution and leaves shield, natural armor, Dexterity, deflection, dodge, size, and other AC sources alone. Any equipped, carried, non-melded equipment item in a mapped native slot prevents that exposed adjustment and keeps the full armor bonus, whether it came from D35E, PAcS, magic gear, or a custom item.

`Called shots use local armor piece AC` is another disabled-by-default house rule. It is the grittier option: when piecemeal armor, called shots, the local armor master setting, and the selected location toggle are all enabled, the pre-hit hook resolves mapped local protection, then replaces only the armor/profile armor contribution with that local total for the called location. The default map combines PAcS profile pieces and native D35E slots: Arm or Wing uses PAcS Arms plus Wrists/Shoulders; Hand uses Hands/Wrists; Eye uses Eyes/Head/Headband; Head and Ear use Head/Headband; Neck uses Neck; Chest, Heart, and Vitals use PAcS Torso plus Chest/Body; and Leg uses PAcS Legs plus Feet. The `Local armor AC source handling` setting controls whether multiple applicable values are summed, reduced to the highest value, or resolved from per-location sum/highest overrides. Ordinary mapped slot gear with no explicit armor-like value contributes `0` but can still prevent exposed fallback. Local armor runs before exposed head/hand checks and never stacks with them, so exposed head/hand remains the softer fallback for empty mapped slots. The inline SettingsConfig location block stores world-level participation toggles keyed by called-shot location ID, and the local armor coverage editor stores world-level coverage-map and aggregation overrides only where the GM changes the defaults. Missing coverage entries use the module defaults; an explicit empty override means local armor `0` for that location. Missing aggregation entries default to summed local armor. Missing location participation toggles default enabled underneath the disabled master switch so new profile locations participate only after a GM opts into the rule.

SettingsConfig also applies a visual dependency layer: disabling piecemeal armor locks the local armor panel, and disabling called shots locks called-shot-only settings such as exposed head/hand, local armor, outcome automation, full-attack modes, feat gates, and the coverage overlay. These locks disable the rendered controls and communicate the parent dependency, but they do not delete the underlying world settings. Helmet Spot/Listen penalties intentionally remain outside those dependencies because they only need equipped D35E Head-slot items.

The `PAcS Helmets` Item compendium provides editable `[PAcS]` Head-slot starter records with house-rule weight/price defaults. Those helmets can prevent exposed headshots because they occupy the native `Head` slot, but their old local armor value flags are ignored by runtime AC math.

Optional Spot/Listen penalties use D35E's `D35E.preRollSkill` hook and append a named source row to `lis` and `spt` roll breakdowns. Configured PAcS helmets can supply per-item values; ordinary equipped Head-slot items can use the module's editable default penalties when no per-item value is present. The module does not write permanent skill values for helmet penalties.

## Called Shots

Called-shot profiles are stored as a world setting. The active profile supplies enabled locations, attack penalties, coverage slots, and outcome effects.

The native workflow has three integration points:

1. The module listens for D35E attack dialog rendering and injects one `Called Shot` selector into `form.attack-form`.
2. The module wraps `ItemUse.prototype.rollAttack` so the selected form value is parsed before D35E starts the roll.
3. The module wraps `ChatAttack.addAttack` so the selected penalty is added to D35E's native attack modifiers for the next relevant attack.

For full attacks, `D35E.ItemUse.preRollAllAttacks` is used to observe the real attack labels. The `Called-shot full-attack feat rules` setting controls only the permission gate for using called shots during D35E Full Attack:

- `Require feats (RAW-adapted)` blocks no-feat full-attack called shots and limits Improved Called Shot users to one called shot.
- `Warn only` allows the configured full-attack mode but warns when the actor lacks the optional feats.
- `Do not require feats` allows the configured full-attack mode without warnings.

Feat benefits still come from actual actor feats. Name-based detection looks for `Improved Called Shot` or `Greater Called Shot` on feat items. Improved supplies the attack bonus, Greater supplies the lower debilitating threshold, and repeated called shots after the first use the same extra penalty path even when a table disables the permission gate.

The module ships the `PAcS Called-Shot Feats` Item compendium as a convenience pack. It exists so GMs do not have to create those feat records by hand in D35E; it is not a separate rules engine and does not make the PF1e-derived optional feats into D&D 3.5 RAW.

Fast-forward attacks keep D35E's no-dialog behavior and do not show called-shot UI.

RAW-adapted range/reach penalties are calculated before the payload reaches D35E attack math. Melee called shots use occupied-token adjacency, not center-to-center distance, so Large and Huge tokens do not get false penalties while touching by edge or corner. A target inside a creature's D35E reach but not adjacent still receives the called-shot `-2`, matching the Ultimate Combat text. Ranged called shots keep the doubled range-increment penalty behavior.

## Effects

Effect specs are small declarative objects. v1.1 supports D35E conditions, ability damage, generic ActiveEffects, note ActiveEffects, save branches, death, and ledger-backed flags/notes for outcomes D35E does not expose as exact native fields.

The chat card does not decide hit outcome. D35E Apply Damage is the boundary: after D35E calculates hit, crit, and post-DR damage, the module chooses normal, critical, or debilitating severity. The `Called-shot effect automation` setting then applies effects automatically, asks the GM before critical/debilitating effects, or leaves the card in advisory-only mode with GM severity buttons.

Every applied outcome writes a target actor ledger entry with source context, saves, actor updates, and created ActiveEffect IDs. The actor sheet restore control reverses recorded updates and removes created ActiveEffects, so lethal and permanent automation remains recoverable.
