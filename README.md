# D35E Piecemeal Armor And Called Shots

RAW-adapted piecemeal armor and called-shot automation for the [D35E Foundry VTT system](https://gitlab.com/dragonshorn/D35E).

This module is an adaptation aid for tables that want configurable piecemeal armor and called-shot workflows in D&D 3.5e games. It does not claim that either rules package is official D&D 3.5 RAW. The bundled defaults are RAW-adapted from Pathfinder 1e Ultimate Combat variant rules where D35E can support them.

**Support:** If this module helps your D35E table, donations are optional and support continued maintenance, compatibility testing, release packaging, and documentation.

[![Sponsor on GitHub](https://img.shields.io/badge/GitHub%20Sponsors-Donate-ea4aaa?style=flat&logo=githubsponsors&logoColor=white)](https://github.com/sponsors/SpencerZPoole) [![Donate with PayPal](https://img.shields.io/badge/PayPal-One--time%20donation-00457C?style=flat&logo=paypal&logoColor=white)](https://paypal.me/mrpooley92)

## Install

In Foundry, open **Add-on Modules > Install Module**, paste this into **Manifest URL**, and install:

```text
https://github.com/SpencerZPoole/d35e-piecemeal-armor-called-shots/releases/latest/download/module.json
```

After installation, open a D35E world, go to **Game Settings > Manage Modules**, enable **D35E Piecemeal Armor And Called Shots**, and reload if Foundry asks.

Versioned release assets are published on GitHub. For v1.2.1, the release manifest is:

```text
https://github.com/SpencerZPoole/d35e-piecemeal-armor-called-shots/releases/download/v1.2.1/module.json
```

## Features

- Adds `PAcS: Torso`, `PAcS: Arms`, and `PAcS: Legs` slots directly to D35E's native Armor and Equipment inventory list.
- Uses the normal D35E `Armor` slot as the baseline suit or torso piece, then overrides only the categories a table mixes.
- Provides a starter catalog for common RAW armor pieces such as padded, leather, studded leather, hide, chain, and plate arms/legs/torso.
- Keeps simple baseline-only armor native to D35E while using a hidden slotless D35E armor carrier only for composite piecemeal math.
- Adds a `Called Shot` dropdown inside D35E's native attack/use dialog.
- Injects called-shot penalties into D35E attack math, so expanded rolls show entries such as `Called Shot: Ear -10`.
- Can adjust D35E's native Apply Damage AC check for called shots that target weaker or stronger piecemeal armor locations.
- Lets armor components and called-shot profile locations name multiple coverage slots, such as `head; eyes; ears`.
- Enforces RAW-adapted Improved/Greater Called Shot full-attack limits.
- Automates called-shot severity and outcomes after D35E Apply Damage, with a default GM confirmation step for critical or debilitating effects and a restore ledger for misclick recovery.
- Prevents double-counting by marking profile source items as worn in the profile while the hidden zero-weight carrier contributes composite D35E armor math.
- Includes an in-Foundry profile editor for locations, penalties, coverage slot(s), and outcome effects.

## Screenshots

![Native D35E attack dialog with Called Shot dropdown](docs/assets/native-called-shot-dropdown.png)

![Full attack called-shot picker](docs/assets/full-attack-picker.png)

![Module settings for D35E Piecemeal Armor And Called Shots](docs/assets/module-settings.png)

## Quick Start

1. Open a D35E world, go to `Game Settings > Manage Modules`, enable the module, and reload if Foundry asks.
2. Equip ordinary armor normally. With no piecemeal overrides, D35E keeps handling armor AC exactly as before.
3. Open the actor sheet inventory. The normal D35E `Armor` slot is the baseline armor.
4. Drag armor items onto `PAcS: Torso`, `PAcS: Arms`, or `PAcS: Legs` when the actor mixes pieces. Empty PAcS slots inherit from the baseline armor when that armor maps to the category.
5. Click a normal D35E weapon or attack use control and choose a target from the native dialog's `Called Shot` dropdown.
6. Roll normally. The called-shot penalty appears in the D35E attack breakdown.
7. Use D35E's native Apply Damage button. When piecemeal armor and called shots are both enabled, AC Details shows the location armor adjustment.
8. The module determines severity. By default, normal effects apply automatically, while critical and debilitating effects ask the GM before changing the target.
9. For table-specific behavior, open Foundry's right sidebar gear icon, choose `Game Settings`, then select `D35E Piecemeal Armor And Called Shots`.

See [docs/USER_GUIDE.md](docs/USER_GUIDE.md) for the full end-user guide.

## Compatibility

- Foundry VTT: verified on v14.362.
- D35E: verified on D35E 3.0.2.
- Foundry v13: not marked verified until a real v13 smoke test is completed.

The module is additive. It does not edit D35E system files, mutate actors on world load, or run in worlds where the module has not been enabled.

## Configuration

Module settings live in Foundry's right sidebar gear tab under `Game Settings > D35E Piecemeal Armor And Called Shots`. The main toggles are `Enable piecemeal armor` and `Enable called shots`, so either half of the module can be used independently. `Called-shot effect automation` defaults to `GM confirms severe effects`: normal outcomes apply after D35E Apply Damage, but critical and debilitating outcomes ask the GM before changing actor data. The called-shot profile editor is available in the same settings category. Profiles are world settings, so a GM can clone or replace the bundled defaults with table-specific locations, penalties, coverage, and effects.

When piecemeal armor and called shots are both enabled, the native Apply Damage check automatically uses location armor for matching called-shot coverage. Coverage slot fields accept one value or a delimiter-separated list, so a helmet component can cover `head; eyes; ears` while a broader armor piece can cover `torso, arms, legs`.

Supported effect specs:

- `note`: creates an ActiveEffect note with module flags.
- `condition`: toggles a D35E actor condition such as `fatigued`, `stunned`, or `blind`.
- `abilityDamage`: rolls and applies ability damage to a D35E ability damage field.
- `abilityDrain`, `bleed`, `speedPenalty`, `dropHeld`, and `flag`: create reversible ledger-backed notes or flags when D35E has no exact native field.
- `death`: marks the target dead and drives HP low enough to make the result obvious.
- `saveBranch`: rolls Fortitude, Reflex, or Will against the AC hit by the attack and applies success/failure branches.
- `activeEffect`: creates a custom Foundry ActiveEffect using supplied changes.

## Caveats

- Called-shot automation can apply lethal and permanent outcomes. The default setting asks the GM before critical or debilitating effects are applied, and GMs can restore applied effects from the target actor's `Called Shot Effects` header button.
- The bundled defaults are optional-rule adaptation, not D&D 3.5 RAW.
- Fast-forward attacks keep D35E's no-dialog behavior and do not show the called-shot selector.
- Some Ultimate Combat results have no exact D35E native field. Those are recorded as explicit actor flags or ActiveEffect notes instead of pretending D35E has native support.

## Public API

After Foundry is ready, the module exposes `game.d35ePiecemealCalledShots`:

- `calculatePiecemealArmor(actorOrItems, options)`
- `resolveArmorProfile(actor)`
- `applyArmorProfile(actor, options)`
- `clearArmorProfile(actor)`
- `setArmorProfileBaseline(actor, itemId)` for migration or advanced scripts; the primary UI uses the native D35E `Armor` slot as baseline.
- `setArmorProfileSlot(actor, category, itemId)`
- `previewArmorSync(actor)`
- `syncArmorAggregate(actor, options)`
- `restoreArmorComponents(actor)`
- `getCalledShotProfiles()`
- `getCalledShotOptions()`
- `stageCalledShot(actor, item, locationId, options)`
- `applyCalledShotOutcome(options)`
- `getCalledShotLedger(actor)`
- `restoreCalledShotLedgerEntry(actor, entryId)`
- `restoreAllCalledShotLedgerEntries(actor)`
- `getIntegrationStatus()`

## Development

```powershell
npm run validate
npm run build:release
```

Before publishing or handing off changes, run the local security gate:

```powershell
node <path-to-local-security-scan.mjs> --root <module-root> --changed-only
```

## Support

Use [GitHub issues](https://github.com/SpencerZPoole/d35e-piecemeal-armor-called-shots/issues) for bugs, compatibility reports, and feature requests. That is the preferred support path. Please include Foundry version, D35E version, module version, browser console errors, and a short reproduction path.
