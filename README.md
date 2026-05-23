# D35E Piecemeal Armor And Called Shots

Optional piecemeal armor and called-shot support for the [D35E Foundry VTT system](https://gitlab.com/dragonshorn/D35E).

This module is an adaptation aid for tables that want configurable piecemeal armor and called-shot workflows in D&D 3.5e games. It does not claim that either rules package is official D&D 3.5 RAW. The bundled defaults are compact, editable scaffolding informed by Pathfinder 1e variant-rule references.

## Install

In Foundry, open **Add-on Modules > Install Module**, paste this into **Manifest URL**, and install:

```text
https://github.com/SpencerZPoole/d35e-piecemeal-armor-called-shots/releases/latest/download/module.json
```

After installation, open a D35E world, go to **Game Settings > Manage Modules**, enable **D35E Piecemeal Armor And Called Shots**, and reload if Foundry asks.

Versioned release assets are published on GitHub. For v1.0.1, the release manifest is:

```text
https://github.com/SpencerZPoole/d35e-piecemeal-armor-called-shots/releases/download/v1.0.1/module.json
```

## Features

- Marks D35E equipment as piecemeal armor components.
- Previews, syncs, and restores one D35E-native aggregate armor item so D35E keeps doing the actual AC math.
- Adds a `Called Shot` dropdown inside D35E's native attack/use dialog.
- Injects called-shot penalties into D35E attack math, so expanded rolls show entries such as `Called Shot: Ear -10`.
- Supports full-attack policies: ask per attack, first attack only, every attack, or disabled.
- Posts GM-confirmed called-shot outcome chat cards.
- Includes an in-Foundry profile editor for locations, penalties, coverage slots, and outcome effects.

## Screenshots

![Native D35E attack dialog with Called Shot dropdown](docs/assets/native-called-shot-dropdown.png)

![Full attack called-shot picker](docs/assets/full-attack-picker.png)

![Module settings for D35E Piecemeal Armor And Called Shots](docs/assets/module-settings.png)

![Piecemeal armor sync dialog](docs/assets/piecemeal-armor-sync.png)

## Quick Start

1. Open a D35E world, go to `Game Settings > Manage Modules`, enable the module, and reload if Foundry asks.
2. Open an actor sheet and use the `Piecemeal Armor` header button for armor preview, sync, or restore.
3. Open equipment items and configure the `Piecemeal Armor` fieldset when an item should count as a component.
4. Click a normal D35E weapon or attack use control and choose a target from the native dialog's `Called Shot` dropdown.
5. Roll normally. The called-shot penalty appears in the D35E attack breakdown.
6. Let the GM apply any normal, critical, or debilitating called-shot outcome from the chat card.
7. For table-specific behavior, open Foundry's right sidebar gear icon, choose `Game Settings`, then select `D35E Piecemeal Armor And Called Shots`.

See [docs/USER_GUIDE.md](docs/USER_GUIDE.md) for the full end-user guide.

## Compatibility

- Foundry VTT: verified on v14.362.
- D35E: verified on D35E 3.0.2.
- Foundry v13: not marked verified until a real v13 smoke test is completed.

The module is additive. It does not edit D35E system files, mutate actors on world load, or run in worlds where the module has not been enabled.

## Configuration

Module settings live in Foundry's right sidebar gear tab under `Game Settings > D35E Piecemeal Armor And Called Shots`. The called-shot profile editor is available there. Profiles are world settings, so a GM can clone or replace the bundled defaults with table-specific locations, penalties, and effects.

Supported v1 effect specs:

- `note`: creates an ActiveEffect note with module flags.
- `condition`: toggles a D35E actor condition such as `fatigued`, `stunned`, or `blind`.
- `abilityDamage`: rolls and applies ability damage to a D35E ability damage field.
- `activeEffect`: creates a custom Foundry ActiveEffect using supplied changes.

## Caveats

- The module does not automatically decide whether a called shot hit, crit, or qualified as a debilitating blow.
- The module does not automatically kill, sever, suffocate, or permanently maim a creature without GM confirmation.
- The bundled defaults are optional-rule scaffolding, not D&D 3.5 RAW.
- Fast-forward attacks keep D35E's no-dialog behavior and do not show the called-shot selector.

## Public API

After Foundry is ready, the module exposes `game.d35ePiecemealCalledShots`:

- `calculatePiecemealArmor(actorOrItems, options)`
- `previewArmorSync(actor)`
- `syncArmorAggregate(actor, options)`
- `restoreArmorComponents(actor)`
- `getCalledShotProfiles()`
- `getCalledShotOptions()`
- `stageCalledShot(actor, item, locationId, options)`
- `applyCalledShotOutcome(options)`
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

Use [GitHub issues](https://github.com/SpencerZPoole/d35e-piecemeal-armor-called-shots/issues) for bugs, compatibility reports, and feature requests. Please include Foundry version, D35E version, module version, browser console errors, and a short reproduction path.

## Donate

If this project helped your D35E table, donations are welcome. GitHub Sponsors is best for recurring sponsorships; PayPal works well for one-time donations.

[![Sponsor on GitHub](https://img.shields.io/badge/GitHub%20Sponsors-Donate-ea4aaa?style=flat&logo=githubsponsors&logoColor=white)](https://github.com/sponsors/SpencerZPoole)
[![Donate with PayPal](https://img.shields.io/badge/PayPal-One--time%20donation-00457C?style=flat&logo=paypal&logoColor=white)](https://paypal.me/mrpooley92)

Donations support Spencer's compatibility testing, release packaging, documentation, and maintenance for this module. They do not fund or represent the D35E system, Foundry Virtual Tabletop, Paizo, Wizards of the Coast, or any upstream/rightsholder work.
