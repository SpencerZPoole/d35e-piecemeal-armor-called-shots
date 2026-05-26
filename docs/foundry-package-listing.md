# Foundry Package Listing Packet

## Package

- Package ID: `d35e-piecemeal-armor-called-shots`
- Title: `D35E Piecemeal Armor And Called Shots`
- Type: Add-on Module
- Author: Spencer Poole
- Repository: `https://github.com/SpencerZPoole/d35e-piecemeal-armor-called-shots`
- Issues: `https://github.com/SpencerZPoole/d35e-piecemeal-armor-called-shots/issues`
- License: MIT

## Short Description

RAW-adapted piecemeal armor and called-shot automation for D35E, integrated into native D35E armor, attack, and Apply Damage workflows.

## Long Description

D35E Piecemeal Armor And Called Shots adds configurable optional-rule helpers for D35E worlds. The current piecemeal armor workflow lives in D35E's native inventory: ordinary D35E armor in the `Armor` slot remains the baseline, while `PAcS: Torso`, `PAcS: Arms`, and `PAcS: Legs` slots override only the categories a table mixes. The `PAcS Armor Pieces` compendium gives users obvious override items such as `[PAcS] Studded Leather, Legs`, `[PAcS] Chainmail, Torso`, and `[PAcS] Full Plate, Arms`, so a player does not need to understand the internal catalog before building a mixed suit. Baseline-only armor stays native to D35E; composite armor uses a hidden zero-weight, slotless D35E carrier so the final AC, max Dex, ACP, ASF, and speed math still flow through D35E without exposing a visible aggregate item. Called shots live inside the native D35E attack/use dialog, apply their attack penalty through D35E's normal modifier breakdown, can adjust D35E's native Apply Damage AC check for local piecemeal armor, show exposed locations as `unarmored location 0`, and can apply, confirm, or leave advisory severity outcomes after D35E resolves hit/crit and post-DR damage.

The module is intentionally explicit that the bundled defaults are PF1e Ultimate Combat adaptation, not official D&D 3.5 RAW. The normal settings focus on table-facing choices: enabling piecemeal armor, enabling called shots, choosing full-attack behavior, choosing whether full-attack called shots require the optional feats, and deciding whether called-shot effects apply automatically, ask the GM before severe outcomes, or stay advisory only. GMs can edit locations, penalties, armor coverage slot(s), and outcome effects from module settings. Coverage fields accept multiple locations such as `head; eyes; ears` or `torso, arms, legs`, and a D35E-calibrated starter catalog fills common padded, leather, studded leather, hide, scale mail, chain shirt, chainmail, breastplate, banded mail, splint mail, half-plate, and full plate mappings. Complete catalog suits are calibrated so piece armor plus the full-suit `+1` equals the matching D&D 3.5e armor bonus. Melee called shots preserve the RAW-adapted non-adjacent `-2`, including cases where reach makes the attack legal but the target is not adjacent. The bundled `PAcS Armor Pieces` Item compendium provides recommended torso/arm/leg override records; `PAcS Called-Shot Feats` provides convenience records for `Improved Called Shot` and `Greater Called Shot`; and `PAcS Helmets` provides optional Head-slot helmet records whose starter values use the matching D35E full armor bonus for local Head/Eye/Ear armor only. These records remain optional-rule support items rather than D&D 3.5 RAW.

## Compatibility

- Foundry VTT minimum: `14`
- Foundry VTT verified: `14.363`
- System: `D35E`
- D35E minimum: `3.0.2`
- D35E verified: `3.0.2`
- Foundry v13 is not marked verified until a real v13 smoke test is completed.

## Version Entry

- Version: `1.4.0`
- Package Manifest URL: `https://github.com/SpencerZPoole/d35e-piecemeal-armor-called-shots/releases/download/v1.4.0/module.json`
- Download URL: `https://github.com/SpencerZPoole/d35e-piecemeal-armor-called-shots/releases/download/v1.4.0/d35e-piecemeal-armor-called-shots-v1.4.0.zip`
- Release Notes URL: `https://github.com/SpencerZPoole/d35e-piecemeal-armor-called-shots/releases/tag/v1.4.0`

## User Install URL

```text
https://github.com/SpencerZPoole/d35e-piecemeal-armor-called-shots/releases/latest/download/module.json
```

## Suggested Categories

- Automation Enhancers
- Combat Enhancements
- Tools and Controls

## Suggested Tags

- `D35E`
- `D&D 3.5e`
- `Foundry VTT`
- `armor`
- `called shots`
- `optional rules`

## Screenshots

Use these repository paths after the repo is public:

- `https://raw.githubusercontent.com/SpencerZPoole/d35e-piecemeal-armor-called-shots/main/docs/assets/native-called-shot-dropdown.png`
- `https://raw.githubusercontent.com/SpencerZPoole/d35e-piecemeal-armor-called-shots/main/docs/assets/full-attack-picker.png`
- `https://raw.githubusercontent.com/SpencerZPoole/d35e-piecemeal-armor-called-shots/main/docs/assets/module-settings.png`
- `https://raw.githubusercontent.com/SpencerZPoole/d35e-piecemeal-armor-called-shots/main/docs/assets/profile-editor.png`

## License And Attribution Summary

The module is unofficial fan tooling for Foundry VTT and D35E. It is not affiliated with Wizards of the Coast, Paizo, Foundry Gaming, or the D35E maintainers. Code is MIT licensed. Bundled defaults are compact, editable optional-rule scaffolding inspired by publicly available Pathfinder 1e variant-rule references; full rules prose is not copied into the module.

Reference links:

- D35E system repository: `https://gitlab.com/dragonshorn/D35E`
- Feature request: `https://gitlab.com/dragonshorn/D35E/-/work_items/1697`
- PF1e called shots reference: `https://legacy.aonprd.com/ultimateCombat/variants/calledShots.html`
- PF1e piecemeal armor reference: `https://legacy.aonprd.com/ultimateCombat/variants/piecemealArmor.html`

## Manual Submission Step

If Foundry package-admin access or package API credentials are not available locally, submit this packet manually through Foundry's package administration flow after the GitHub release URLs have been verified.
