# User Guide

D35E Piecemeal Armor And Called Shots adds optional-rule helpers to the D35E Foundry VTT system. It defaults to RAW-adapted Ultimate Combat automation where D35E can support it, while staying explicit that these are not official D&D 3.5 RAW.

The module has two main workflows:

- Piecemeal armor: use D35E's normal inventory. The native `Armor` slot is the baseline, and the module adds `PAcS: Torso`, `PAcS: Arms`, and `PAcS: Legs` slots for mixed pieces.
- Called shots: pick a called-shot location from D35E's normal attack dialog, roll normally, and let D35E Apply Damage resolve hit, location armor AC, severity, and outcomes.

## First Five Minutes

1. Open a D35E world, go to `Game Settings > Manage Modules`, enable the module, and reload if Foundry asks.
2. Open an actor sheet.
3. Equip ordinary armor normally. With no profile overrides, D35E handles armor AC normally.
4. If the actor mixes pieces, drag armor items onto `PAcS: Torso`, `PAcS: Arms`, or `PAcS: Legs` in the actor sheet's Armor and Equipment list.
5. Open a weapon or attack from the normal D35E sheet controls.
6. Choose a location from the native attack dialog's `Called Shot` dropdown, or leave it on `None`.
7. Roll the attack and expand the result to see the called-shot modifier in D35E's native breakdown.
8. Open the module settings when your table wants different locations, penalties, effects, automation, or full-attack behavior.

## Where The Controls Live

| Control | Location | Purpose |
| --- | --- | --- |
| Native `Armor` slot | Actor sheet Armor and Equipment list | Uses a normal D35E armor item as the baseline armor source. |
| `PAcS: Torso`, `PAcS: Arms`, `PAcS: Legs` | Actor sheet Armor and Equipment list | Replaces only that armor category. Empty PAcS slots inherit the native Armor baseline when the baseline catalog supports that category. |
| `Worn in profile` chip | Actor inventory rows | Marks source items whose native D35E armor math is temporarily neutralized to prevent double-counting. |
| `Called Shot` dropdown | D35E attack/use dialog | Applies a configured called-shot penalty through the native attack workflow. |
| Full-attack picker | Opens after `Full Attack` when configured | Lets the user choose `None` or a location for each D35E attack label. |
| `PAcS Called-Shot Feats` pack | Compendium Packs sidebar | Convenience item records for `Improved Called Shot` and `Greater Called Shot`. |
| `PAcS Helmets` pack | Compendium Packs sidebar | Optional Head-slot helmet records for tables using the helmet local armor house rule. |
| Called Shot Effects | Actor sheet header after an applied outcome | Lets a GM restore called-shot effects if the wrong damage card or target was used. |
| Profile editor | Module settings | Edits locations, penalties, coverage slots, and outcome effects. |

## Module Settings

Open Foundry's right sidebar, click the gear icon, choose `Game Settings`, then select `D35E Piecemeal Armor And Called Shots` from the category list on the left.

![D35E Piecemeal Armor And Called Shots module settings](assets/module-settings.png)

Settings:

- `Edit called shot profiles`: opens the profile editor for locations, attack penalties, severity tiers, coverage slots, and outcome effects.
- `Enable piecemeal armor`: adds the PAcS inventory slots, item piece fields, piecemeal armor math, hidden D35E carrier, and location armor data. Turning it off suspends piecemeal armor automation without disabling called shots.
- `Enable called shots`: adds the `Called Shot` selector to D35E's native attack dialog, applies the configured attack penalty to the native roll breakdown, carries context into Apply Damage, and posts outcome cards. Turning it off does not disable piecemeal armor.
- `Enable helmet head coverage house rule`: optional and disabled by default. Configured helmets in D35E's native `Head` slot provide local Head, Eye, and Ear armor AC without adding to total AC.
- `Apply helmet Spot/Listen penalties`: optional and disabled by default. Configured helmets in D35E's native `Head` slot add their table-defined Spot and Listen penalties to native D35E skill rolls.
- `Called-shot effect automation`: controls actor changes after Apply Damage. `GM confirms severe effects` is the default: normal outcomes apply automatically, while critical and debilitating outcomes ask the GM first. `Apply effects automatically` applies all resolved outcomes. `Advisory only` never changes actor data unless the GM clicks a chat-card severity button.
- `Called shots on full attacks`: controls whether full attacks ask per attack, apply to the first attack only, apply to every attack, or ignore called-shot selections. See [Full Attacks](#full-attacks).
- `Called-shot full-attack feat rules`: controls only whether the module blocks full-attack called shots when the attacker lacks the optional feats. `Require feats (RAW-adapted)` is the default. `Warn only` allows the full attack but warns about missing Improved or Greater Called Shot. `Do not require feats` allows the full attack without warnings. Feat bonuses still require the actor to actually have the feat.
- Location armor for called shots is automatic when both piecemeal armor and called shots are enabled. See [Location Armor AC](#location-armor-ac).
- `Show location armor overlay`: adds the matching piecemeal armor coverage slot to called-shot chat cards as advisory information only.
- GM-only source/profile metadata appears automatically to GM users; players still see the useful called-shot result information.

## Called Shots

Click the normal D35E use or attack control for a weapon or attack item. The native D35E attack dialog gains a `Called Shot` dropdown near the rest of the roll options.

![Native D35E attack dialog with Called Shot dropdown](assets/native-called-shot-dropdown.png)

Leave the selector on `None` for a normal attack. Choose a location when the attack is meant to be a called shot. The penalty is injected into D35E's normal attack calculation, so the expanded attack roll can show entries such as `Called Shot: Ear -10` alongside native modifiers.

Fast-forward attacks keep D35E's no-dialog behavior. They do not show the called-shot dropdown.

## Location Armor AC

A called shot carries its location into D35E's native Apply Damage workflow. When the GM clicks Apply, the module adjusts the target's AC by replacing the active armor profile's total armor contribution with the matching piecemeal armor location.

Example: if the armor profile contributes 18 armor AC but the target's legs contribute 17, a called shot to the legs applies an AC Details row such as `Called Shot Location Armor: Leg (profile 18 -> location 17) -1` before D35E checks hit and crit. If the called location is better protected than the profile total, the adjustment can be positive.

Location armor AC needs piecemeal armor enabled, called shots enabled, an active armor profile or enabled helmet head coverage, and a called-shot profile location with matching coverage slot(s). Called-shot touch attacks are checked against normal AC rather than touch AC. No-check damage, missing targets, disabled subsystems, and targets without matching local armor keep D35E's normal behavior.

## Helmet Head Coverage House Rule

Helmet coverage is a non-RAW house rule and is disabled by default. It is meant for tables that want head protection to matter for called shots without adding a helmet bonus to every normal AC check.

Workflow:

1. Enable `Enable helmet head coverage house rule` in module settings.
2. Open Foundry's Compendium Packs sidebar and drag a helmet from `PAcS Helmets` to the actor, or configure your own equipment item.
3. Equip the helmet in D35E's native `Head` slot.
4. For custom items, click the shield icon on that inventory row, open the item sheet, and check `Use as helmet head coverage`.
5. Enter the helmet's `Head local armor bonus`, or choose a family to use the module's D35E full-armor-bonus starter value for that helmet type.
6. Leave coverage as `head; eyes; ears` unless your table wants a narrower or broader helmet.

When the setting is on, Head, Eye, and Ear called shots use the configured helmet instead of the torso fallback. The helmet's local armor value stands on its own: it does not inherit from torso armor, baseline armor, suit pieces, or other equipped armor. The bundled helmets use the matching D35E armor's full armor bonus as a starter value, so a chainmail coif starts at `5` and a full plate helm starts at `8` for Head/Eye/Ear local armor only. GMs who want the grittier family-cap interpretation can edit the item and lower `Head local armor bonus`. If no configured helmet is equipped in the `Head` slot, the local head armor is treated as `0`, so a head called shot against an armored target can lower the Apply Damage AC. Torso, heart, vitals, arms, hands, legs, and feet keep the normal PAcS location armor behavior.

The separate `Apply helmet Spot/Listen penalties` setting reads the same configured helmet. Enter Spot and Listen penalty numbers on the item; the module adds a `Helmet (...)` row to native D35E Spot and Listen roll breakdowns. These penalties are table-defined and default to `0`; the module does not hardcode AD&D 2e helmet table values.

## Full Attacks

The `Called shots on full attacks` setting controls what happens when a location is selected and the native D35E `Full Attack` button is used. By default, those choices are still gated by the attacker feats. A GM can loosen only the permission check with `Called-shot full-attack feat rules`.

![Full attack called-shot picker](assets/full-attack-picker.png)

Modes:

- `Ask for each attack`: opens one secondary picker before dice roll. The first row starts with the location chosen in the native dialog; every row can be changed to `None` or another enabled location.
- `First attack only`: applies the selected location to the first D35E attack only.
- `Every attack`: applies the selected location to each generated attack.
- `Disable on full attacks`: ignores called-shot selections when `Full Attack` is used.

If the per-attack picker is closed without confirming, the full attack continues with no called shots.

Feat behavior:

- No feat: a called shot is treated as a single full-round attack; the module blocks selected called shots from D35E Full Attack.
- `Improved Called Shot`: adds `+2` to called-shot attacks and allows one called shot during a multiattack or full attack.
- `Greater Called Shot`: allows multiple called shots in the same round, applies `-5` to each additional called shot after the first, and lowers the debilitating minimum damage from `50` to `40`.

The full-attack feat setting has three modes:

- `Require feats (RAW-adapted)`: preserves the RAW-adapted default above.
- `Warn only`: allows the selected full-attack mode but warns when the attacker lacks Improved or Greater Called Shot.
- `Do not require feats`: allows the selected full-attack mode without warnings.

Even in `Warn only` or `Do not require feats`, actual feat benefits stay tied to actor feats. Improved still supplies the `+2` only when the actor has `Improved Called Shot`, and Greater still supplies the `40` debilitating threshold only when the actor has `Greater Called Shot`. When multiple called shots happen in one full attack, each additional called shot after the first still takes the repeated-called-shot `-5` penalty so the relaxed modes do not become stronger than the Greater Called Shot workflow.

## Called-Shot Feat Pack

Open Foundry's Compendium Packs sidebar and look for `PAcS Called-Shot Feats`. The pack contains `Improved Called Shot` and `Greater Called Shot` as small D35E Item records that can be imported or dragged to an actor like other feats.

These feat items are convenience records for this module. Their descriptions are paraphrased from the optional PF1e called-shot support rules, and they are not D&D 3.5 RAW. PAcS detects the exact names `Improved Called Shot` and `Greater Called Shot`, so avoid renaming the actor's feat items if you want the automation to recognize them.

## Helmet Pack

Open Foundry's Compendium Packs sidebar and look for `PAcS Helmets`. The pack contains preconfigured Head-slot equipment for padded, leather, studded leather, hide, scale mail, chain shirt, chainmail, breastplate, banded mail, splint mail, half-plate, and full plate helmet styles.

These helmets are optional house-rule support items. Their starter local armor values use the matching D35E full armor bonus and affect only Head, Eye, and Ear called-shot local armor while the helmet setting is enabled. They do not add normal AC, and their Spot/Listen penalties default to `0` until a GM edits them.

## Called-Shot Chat Cards

After a called-shot roll, the module posts a chat card. Use D35E's native Apply Damage button, and the module resolves hit state, post-DR damage, severity, saves, and outcomes after D35E finishes its damage workflow.

Severity rules:

- Miss or damage fully negated by DR: no called-shot effect.
- Hit under the debilitating threshold: normal outcome.
- Confirmed critical under the debilitating threshold: critical outcome.
- Damage at least half target maximum HP and at least the minimum threshold: debilitating outcome.

Saving throw DCs use the attack total, matching the AC hit by the called shot. If D35E has no native field for an outcome, the module records a flagged actor note instead of silently faking native support.

In `Advisory only`, the GM decides whether to apply normal, critical, or debilitating outcomes from the card.

## Restoring Called-Shot Effects

Applied effects are recorded on a target actor ledger with the source message, attacker, location, severity, save results, actor updates, and created ActiveEffects. If an outcome was applied to the wrong target or the table changes the adjudication, open the target sheet and click `Called Shot Effects` in the actor header. Restore reverses recorded actor updates and removes ActiveEffect notes created by that ledger entry.

## Piecemeal Armor

The v1.2 workflow starts from the D35E armor users already understand. Equip normal armor normally. If the actor is only wearing one ordinary D35E armor item and no profile overrides are set, D35E remains the source of truth for AC.

When the actor mixes armor pieces, open the actor sheet inventory area and stay in D35E's normal Armor and Equipment list.

Inventory slots:

- `Armor`: the ordinary D35E armor slot. This is the baseline armor source.
- `PAcS: Torso`: replaces only torso armor.
- `PAcS: Arms`: replaces only arm armor.
- `PAcS: Legs`: replaces only leg armor.
- Clear icon on a PAcS slot item: restores that item and empties the PAcS slot.
- Native trash/delete on a PAcS slot item: deletes that inventory item and clears only the PAcS slot that referenced it. Use the clear icon when you want to keep the item.
- Dragging a PAcS-worn item back to the native `Armor` slot makes it the baseline suit again. Occupied PAcS slots stay as overrides.

Empty PAcS slots inherit from the native Armor baseline when the baseline maps to that category. For example, studded leather in the Armor slot can fill torso, arms, and legs. A breastplate maps to torso only, so empty arms and legs remain unarmored unless a table assigns overrides.

RAW-adapted math:

- One resolved piece uses that piece's listed armor statistics.
- Two resolved pieces add armor bonus, cost, and weight, then use the worst max Dex, ACP, ASF, and speed limits.
- Three resolved categories make a suit and gain the extra `+1` armor bonus.
- Mixed full suits add the RAW `+5%` arcane spell failure adjustment.

The bundled catalog is D35E-calibrated. It keeps the PF1e piecemeal structure, but complete catalog suits are adjusted so `torso + arms + legs + full-suit +1` equals the normal D&D 3.5e armor bonus. For example, chainmail resolves as `3 + 1 + 0 + 1 = 5`, and full plate resolves as `5 + 1 + 1 + 1 = 8`. Chain shirt and breastplate are torso-only entries, so they do not get a suit bonus unless the table deliberately adds other pieces.

Known armor items use the module catalog for padded, leather, studded leather, hide, scale mail, chain shirt, chainmail, breastplate/plate torso, banded mail, splint mail, half-plate, and full plate mappings. Unknown custom armor is marked `Needs piece values` instead of being guessed. Use the shield icon on an inventory row to open explicit piece fields for unusual published pieces or custom 3.5e adaptations before assigning them.

When a composite profile is active, the module creates a hidden zero-weight, slotless D35E carrier so D35E still owns the final AC, max Dex, ACP, ASF, and speed math without occupying the visible Armor slot. Source items remain visible in inventory with a `worn in profile` chip, and their native armor math is backed up and neutralized to prevent double-counting. If Dex to AC looks lower than expected, also check D35E encumbrance because it can apply its own max Dex cap after armor. The old visible `Piecemeal Armor Aggregate` workflow is retained only as internal migration/recovery support for older worlds.

When you hover an AC value on the D35E sheet, the source breakdown expands the hidden carrier into the active PAcS torso, arms, legs, full-suit bonus, and enhancement rows. Zero-value pieces still appear there so odd-looking combinations, such as chainmail legs contributing `+0`, remain explainable.

## Profile Editor

Open the right sidebar gear tab, choose `Game Settings`, select `D35E Piecemeal Armor And Called Shots`, then click `Open Profile Editor` next to `Edit called shot profiles`.

![Called-shot profile editor](assets/profile-editor.png)

Profiles control:

- location labels and IDs;
- attack penalties;
- whether locations are enabled;
- matching armor coverage slot(s);
- normal, critical, and debilitating outcome effects.

Effect snippets use JSON because they map directly to the module's declarative effect engine. Use the Advanced JSON section for full-profile import/export backups.

Supported effect types include `note`, `condition`, `abilityDamage`, `abilityDrain`, `bleed`, `speedPenalty`, `dropHeld`, `flag`, `death`, `saveBranch`, and custom `activeEffect`. Severe outcomes are intentionally reversible through the ledger.

## Troubleshooting

### I do not see the called-shot dropdown

Confirm the module is enabled, called-shot support is enabled in module settings, and the attack was opened through a normal D35E dialog. Shift-click or other fast-forward attacks skip the dialog by design.

### The attack penalty did not apply

Confirm the attack was rolled from the same native dialog where the location was selected. Expand the D35E attack result and look for a modifier such as `Called Shot: Ear -10`.

### The full-attack picker did not open

Check the `Called shots on full attacks` setting. The picker opens only in `Ask for each attack` mode and only when a called-shot location was selected in the native dialog. The attacker also needs `Improved Called Shot` for one called shot during a full attack or `Greater Called Shot` for multiple called shots.

If your table wants to allow the workflow without those feats, change `Called-shot full-attack feat rules` to `Warn only` or `Do not require feats`. The imported feats still control the `+2` bonus and Greater Called Shot's lower debilitating threshold.

### A called shot killed or maimed the target

That is expected for some critical and debilitating outcomes. The default `Called-shot effect automation` setting asks the GM before applying those severe effects. Open the target actor sheet and use `Called Shot Effects` to restore the ledger entry if the wrong target, wrong damage card, or wrong table ruling was used.

### Armor totals or weight look doubled

Clear each occupied `PAcS:` slot with its clear icon, then assign the pieces again. In the native profile workflow, only the hidden slotless profile carrier should contribute composite D35E armor math; source items should show `worn in profile` and should not also contribute native armor AC.

### The profile says Needs piece values

The selected armor item is not in the starter catalog and is not configured as an explicit piecemeal armor item. Configure the item with piece category and armor values, then assign it again.

### Should pieces be armor or miscellaneous equipment?

Armor items are easiest because they can be dragged from D35E compendiums or inventory into the profile slots. Miscellaneous records still work for custom table pieces when they have explicit module piece values.

### Where should I report issues?

GitHub issues are the preferred place for bug reports, compatibility notes, and follow-up testing notes.

### I still see a Piecemeal Armor Aggregate item

Clear occupied `PAcS:` slots if the actor is already using the native workflow. The visible aggregate workflow is no longer part of the normal settings menu; if an older actor still shows one, reassign or clear the actor's PAcS slots so the module can migrate it to the native profile.

### Location armor did not change the Apply Damage AC

Confirm piecemeal armor and called shots are both enabled. For normal PAcS armor, the target needs an active armor profile and a called-shot location whose coverage slot matches at least one resolved armor piece. No-check damage intentionally skips location armor AC.

For the optional helmet house rule, also confirm the helmet setting is enabled, the helmet item is equipped in D35E's native `Head` slot, and `Use as helmet head coverage` is checked on that item. A magic item or equipment item with "Helmet" in its name will not affect local head armor until that checkbox and a head local armor bonus or D35E family starter value are configured.

### I want D&D 3.5 RAW only

Leave called shots disabled and use piecemeal armor only if your table has adopted a house rule for it. The module is explicit that the bundled defaults are Ultimate Combat adaptation, not official D&D 3.5 RAW.
