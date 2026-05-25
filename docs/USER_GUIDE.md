# User Guide

D35E Piecemeal Armor And Called Shots adds optional-rule helpers to the D35E Foundry VTT system. It is meant to support GM adjudication, not replace it.

The module has two main workflows:

- Piecemeal armor: configure equipment pieces, preview the combined armor profile, then sync one D35E-native aggregate armor item.
- Called shots: pick a called-shot location from D35E's normal attack dialog, roll normally, and let the GM apply any outcome from chat.

## First Five Minutes

1. Open a D35E world, go to `Game Settings > Manage Modules`, enable the module, and reload if Foundry asks.
2. Open an actor sheet.
3. Open each component equipment item, switch to its `Details` tab, and check `Include in piecemeal armor sync` in the `Piecemeal Armor` fieldset.
4. Click `Piecemeal Armor` in the actor sheet header to preview and sync the aggregate item.
5. Open a weapon or attack from the normal D35E sheet controls.
6. Choose a location from the native attack dialog's `Called Shot` dropdown, or leave it on `None`.
7. Roll the attack and expand the result to see the called-shot modifier in D35E's native breakdown.
8. Open the module settings when your table wants different locations, penalties, effects, or full-attack behavior.

## Where The Controls Live

| Control | Location | Purpose |
| --- | --- | --- |
| `Piecemeal Armor` | Actor sheet header | Preview, sync, or restore aggregate armor math. |
| Shield icon | Actor inventory rows | Opens an equipment item so it can be configured as a piecemeal armor component. |
| `Piecemeal Armor` fieldset | Equipment item sheet `Details` tab | Stores armor-piece values and coverage slot(s). |
| `Called Shot` dropdown | D35E attack/use dialog | Applies a configured called-shot penalty through the native attack workflow. |
| Full-attack picker | Opens after `Full Attack` when configured | Lets the user choose `None` or a location for each D35E attack label. |
| Outcome buttons | Called-shot chat card | Lets the GM confirm normal, critical, or debilitating effects. |
| Profile editor | Module settings | Edits locations, penalties, coverage slots, and outcome effects. |

## Module Settings

Open Foundry's right sidebar, click the gear icon, choose `Game Settings`, then select `D35E Piecemeal Armor And Called Shots` from the category list on the left.

![D35E Piecemeal Armor And Called Shots module settings](assets/module-settings.png)

Settings:

- `Edit called shot profiles`: opens the profile editor for locations, attack penalties, severity tiers, coverage slots, and GM-confirmed effects.
- `Enable piecemeal armor automation`: shows piecemeal armor fields on equipment items and adds GM sync/restore controls to actor sheets.
- `Enable called shot helper`: adds the `Called Shot` selector to D35E's native attack dialog and applies the configured attack penalty to the native roll breakdown.
- `Called shots on full attacks`: controls whether full attacks ask per attack, apply to the first attack only, apply to every attack, or ignore called-shot selections. See [Full Attacks](#full-attacks).
- `Called-shot local armor AC`: controls whether D35E's native Apply Damage AC check uses the called location's piecemeal armor instead of the aggregate armor contribution, shows that adjustment only, or ignores local armor. See [Local Armor AC](#local-armor-ac).
- `Show location armor overlay`: adds the matching piecemeal armor coverage slot to called-shot chat cards as advisory information only.
- `Show GM-only called shot details`: shows source/profile metadata and outcome context to GM users. This is a client setting, so each GM can choose whether they want the extra detail.

## Called Shots

Click the normal D35E use or attack control for a weapon or attack item. The native D35E attack dialog gains a `Called Shot` dropdown near the rest of the roll options.

![Native D35E attack dialog with Called Shot dropdown](assets/native-called-shot-dropdown.png)

Leave the selector on `None` for a normal attack. Choose a location when the attack is meant to be a called shot. The penalty is injected into D35E's normal attack calculation, so the expanded attack roll can show entries such as `Called Shot: Ear -10` alongside native modifiers.

Fast-forward attacks keep D35E's no-dialog behavior. They do not show the called-shot dropdown.

## Local Armor AC

If `Called-shot local armor AC` is set to `Adjust AC in Apply Damage`, a called shot carries its location into D35E's native Apply Damage workflow. When the GM clicks Apply, the module adjusts the target's AC by replacing the synced aggregate armor contribution with the matching piecemeal armor location.

Example: if the aggregate armor contributes 18 armor AC but the target's legs contribute 17, a called shot to the legs applies `Called Shot Local Armor: Leg -1` in AC Details before D35E checks hit and crit. If the called location is better protected than the aggregate, the adjustment can be positive.

Modes:

- `Adjust AC in Apply Damage`: changes the D35E hit and crit check and adds an AC Details row.
- `Show adjustment only`: adds the AC Details row as advisory context but does not change the hit or crit check.
- `Disabled`: leaves Apply Damage AC unchanged.

Local armor AC needs a synced `Piecemeal Armor Aggregate`, a called-shot profile location with matching coverage slot(s), and at least one piecemeal armor component for that coverage. Touch AC, no-check damage, missing targets, and targets without matching piecemeal armor keep D35E's normal behavior.

## Full Attacks

The `Called shots on full attacks` setting controls what happens when a location is selected and the native D35E `Full Attack` button is used.

![Full attack called-shot picker](assets/full-attack-picker.png)

Modes:

- `Ask for each attack`: opens one secondary picker before dice roll. The first row starts with the location chosen in the native dialog; every row can be changed to `None` or another enabled location.
- `First attack only`: applies the selected location to the first D35E attack only.
- `Every attack`: applies the selected location to each generated attack.
- `Disable on full attacks`: ignores called-shot selections when `Full Attack` is used.

If the per-attack picker is closed without confirming, the full attack continues with no called shots.

## Called-Shot Chat Cards

After a called-shot roll, the module posts a chat card for the GM. The card shows the selected location, attack penalty, and configurable outcome buttons.

![Called-shot chat outcome card](assets/called-shot-chat-card.png)

The GM decides whether to apply a normal, critical, or debilitating outcome. This is intentional: the original D&D 3.5e system does not provide one universal called-shot subsystem, and the bundled defaults are table-editable optional-rule scaffolding.

## Piecemeal Armor

Open an equipment item, switch to the `Details` tab, and use the `Piecemeal Armor` fieldset. The item can remain in inventory as a module-managed component record.

![Piecemeal armor item fields](assets/item-armor-fields.png)

Component items can begin as D35E armor, shield, or miscellaneous equipment. Use the module fields for armor math and coverage. After sync, only the generated `Piecemeal Armor Aggregate` item contributes D35E armor AC. Component records are converted to miscellaneous clothing-style records in sensible visual body slots while their native armor math is backed up and neutralized.

Coverage slot names also drive local armor AC for called shots. A called-shot profile location with coverage slot `legs` looks for piecemeal armor components whose coverage slot normalizes to `legs`. Coverage fields can contain one value or several values separated by commas, semicolons, pipes, slashes, or line breaks. For example, `head; eyes; ears` lets one helmet component protect head, eye, and ear called shots, while `torso, arms, legs` lets a broad armor component cover several larger regions.

When the actor is ready, click `Piecemeal Armor` on the actor sheet to preview the aggregate.

![Piecemeal armor sync dialog](assets/piecemeal-armor-sync.png)

Syncing changes actor item data:

- The module creates or updates one item named `Piecemeal Armor Aggregate`.
- The aggregate item carries the D35E armor values that should contribute to actor math.
- The aggregate item has zero weight so component item weight is not counted twice for encumbrance.
- Component items keep module flags, have their native D35E armor fields backed up and neutralized, and become visual `misc`/`clothing` equipment records while synced.
- Restore reverses the backed-up fields and removes the aggregate item.

Inventory chips:

- `piece: <slot>`: this item is currently a piecemeal armor component.
- `aggregate`: this is the generated D35E armor item used for actual armor math.
- `synced component`: this item has native D35E armor fields backed up by the module.

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

## Troubleshooting

### I do not see the called-shot dropdown

Confirm the module is enabled, called-shot support is enabled in module settings, and the attack was opened through a normal D35E dialog. Shift-click or other fast-forward attacks skip the dialog by design.

### The attack penalty did not apply

Confirm the attack was rolled from the same native dialog where the location was selected. Expand the D35E attack result and look for a modifier such as `Called Shot: Ear -10`.

### The full-attack picker did not open

Check the `Called shots on full attacks` setting. The picker opens only in `Ask for each attack` mode and only when a called-shot location was selected in the native dialog.

### Armor totals or weight look doubled

Use the actor `Piecemeal Armor` dialog and choose Restore, then Sync again. The aggregate item should be the only D35E-native armor item contributing armor math. Version 1.0.6 and later sets aggregate weight to zero so component item weight remains the encumbrance source.

### The armor dialog says no syncable pieces were found

Open the equipment item, switch to the `Details` tab, check `Include in piecemeal armor sync`, and confirm the item has armor-piece values. The sync button appears when at least one carried, unbroken, non-melded component is available.

### Should pieces be armor or miscellaneous equipment?

Either works. If a component needs D35E-native armor fields for ordinary item bookkeeping, make it armor or shield. If it is easier to track by body slot, make it miscellaneous equipment and enter the armor values in the module fieldset. The generated aggregate item is the piece that contributes D35E armor AC after sync. Synced components become reversible visual records so the sheet can still show where the pieces sit.

### Where should I report issues?

GitHub issues are the preferred place for bug reports, compatibility notes, and follow-up testing notes.

### The aggregate armor item is not contributing AC

After syncing, confirm the item named `Piecemeal Armor Aggregate` is equipped. Version 1.0.1 and later explicitly re-equips the generated aggregate after D35E creates or updates it.

### Local armor did not change the Apply Damage AC

Confirm `Called-shot local armor AC` is set to `Adjust AC in Apply Damage`, the target has a synced aggregate armor item, and the called-shot location's coverage slot matches at least one piecemeal armor component. If one piece covers several locations, enter them together, such as `head; eyes; ears`. Touch AC and no-check damage intentionally skip local armor AC.

### I want D&D 3.5 RAW only

Leave called shots disabled and use piecemeal armor only if your table has adopted a house rule for it. The module is explicit that the bundled defaults are not official D&D 3.5 RAW.
