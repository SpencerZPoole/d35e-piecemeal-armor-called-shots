# Changelog

## Unreleased

- Changed PAcS slot assignment so Torso/Arms/Legs slots accept only real PAcS armor-piece items for the matching category.
- Added a full-suit breakdown path for recognized native D35E armor dropped onto a PAcS slot, creating matching `[PAcS]` pieces while preserving visible price/weight totals and simple copied armor metadata.
- Restricted the breakdown prompt to vanilla full armor suits; torso-only armor, shields, custom equipment, and other non-PAcS items are rejected instead of opening the breakdown flow.
- Made `Enable piecemeal armor` hide the `PAcS:` inventory slots when disabled, giving called-shots-only tables a cleaner actor sheet.
- Tightened masterwork, special material, and magic armor math so partial suit-bound magic stays inert, separately enchanted pieces use torso > legs > arms precedence, and mithral-style benefits require all active pieces to be mithral.
- Fixed vanilla full-suit breakdown so copied masterwork/enhancement data stays suit-bound instead of making each generated piece separately magical.
- Reduced item-sheet overflow in the PAcS armor/helmet configuration panel by splitting it into responsive sections with advanced fields collapsed by default.
- Updated docs to explain the stricter baseline-vs-piece workflow and the breakdown prompt.

## 1.4.0

- Added a `PAcS Armor Pieces` Item compendium with ready-to-use torso, arm, and leg override records generated from the D35E-calibrated armor catalog.
- Added pack generation and validation for `[PAcS]` armor piece items, including half-plate, full plate, breastplate, chain shirt, chainmail, and studded leather examples.
- Normalized shipped PAcS armor and helmet equipment with `[PAcS]` item names plus complete description, weight, price, HP, and safe D35E physical item defaults.
- Hardened explicit PAcS piece assignment so a piece dropped on the wrong category is rejected instead of silently changing category.
- Fixed called-shot local armor so an exposed location on an otherwise armored PAcS target shows `unarmored location 0` in D35E Apply Damage AC Details instead of silently using full AC.
- Updated onboarding docs, package copy, and troubleshooting to explain the recommended baseline-plus-piece workflow.

## 1.3.0

- Added a disabled-by-default helmet head coverage house rule using D35E's native `Head` slot for Head/Eye/Ear called-shot local armor.
- Changed helmet local armor to use each configured helmet's own value directly instead of inheriting from torso/profile armor.
- Updated default helmet local armor values to use the matching D35E full armor bonus for Head/Eye/Ear called-shot checks only.
- Added a `PAcS Helmets` Item compendium with preconfigured optional helmet records for the D35E-calibrated armor styles.
- Added optional configured helmet Spot/Listen penalties that appear in native D35E skill roll breakdowns without permanently changing actor skill values.
- Documented helmet coverage as a non-RAW table option separate from RAW-adapted Torso/Arms/Legs piecemeal armor math.
- Fixed melee called-shot range/reach adjacency detection for Large/Huge tokens while preserving the RAW `-2` penalty when a target is within reach but not adjacent.
- Calibrated the bundled piecemeal armor catalog to D35E/D&D 3.5e armor bonuses so complete catalog suits close to their normal D35E armor values.

## 1.2.1

- Reworked the native profile presentation into D35E inventory slots: the normal `Armor` slot is the baseline and `PAcS: Torso`, `PAcS: Arms`, and `PAcS: Legs` are module-owned override slots.
- Fixed profile baseline resolution and hidden carrier slot behavior so explicit PAcS-only setups do not inherit stale native armor AC and the hidden carrier no longer occupies the visible Armor slot.
- Added support for moving a PAcS-worn armor item back to the native `Armor` slot as the baseline suit.
- Stabilized PAcS slot deletion so native item trash/delete clears only the referenced slot and preserves surviving piecemeal assignments.
- Expanded native AC hover/source details so composite PAcS profiles show torso, arms, legs, suit bonus, and enhancement rows instead of one opaque carrier line.
- Cleaned up the module settings menu around user-facing controls and hid legacy rules/workflow switches from normal configuration.
- Fixed called-shot Apply Damage context through the native Roll Defense dialog so `Called Shot Location Armor` appears in AC Details when location armor is active.
- Updated armor-profile tests and public docs for the native inventory-slot workflow.

## 1.2.0

- Replaced the default visible aggregate armor workflow with a native actor-sheet Piecemeal Armor Profile.
- Added Baseline, Torso, Arms, and Legs profile controls; empty piece slots inherit the baseline when the catalog maps that category.
- Kept baseline-only armor native to D35E and moved composite armor math to a hidden zero-weight internal carrier.
- Added catalog mappings for studded leather, hide, chain, chain shirt, breastplate/plate torso, half-plate, and full plate profile resolution.
- Added migration from legacy visible aggregate/component state into profile slots.
- Updated local armor AC to read resolved profile pieces before falling back to legacy aggregate data.
- Added profile API helpers and armor-profile tests for baseline, override, one-piece, unresolved custom armor, hidden carrier, restore, and migration behavior.
- Updated public docs for the v1.2 armor profile workflow and retained legacy aggregate sync as an opt-in compatibility mode.

## 1.1.0

- Changed the default rules mode to RAW-adapted Ultimate Combat automation while keeping the v1.0 workflow as an opt-in legacy mode.
- Fixed piecemeal armor formulas: complete suits gain `+1`, ACP/ASF/max Dex use worst-piece behavior, mixed complete suits add `+5%` ASF, hasty donning adjusts armor/ACP, mithral adjustments apply when all active pieces are mithral, and separate-piece magic/masterwork follows torso > legs > arms precedence.
- Added separate armor `Piece category` and called-shot `Coverage slot(s)` fields so armor math and local armor mapping no longer fight over one field.
- Added a verified starter catalog for common padded, leather, chain, and plate arm/leg/torso armor pieces.
- Fixed the default called-shot profile to use Table 5-4 penalties, including Heart as challenging `-10`.
- Added RAW-adapted called-shot full-attack handling for Improved Called Shot and Greater Called Shot, including the additional `-5` penalty and the Greater `40` damage debilitating minimum.
- Added automatic called-shot severity and outcome application after D35E Apply Damage, with save DCs based on the attack total and no effect when the hit misses or post-DR damage is zero.
- Added a target actor called-shot ledger and GM restore controls for automatic conditions, ability damage, death, notes, flags, and ActiveEffects.
- Updated local armor AC so called-shot touch attacks use normal AC and torso coverage can protect head/neck-style RAW targets by default.
- Expanded tests and public documentation for RAW-adapted behavior, legacy mode, severe outcomes, and restore workflow.

## 1.0.6

- Fixed armor sync so synced components become reversible visual `misc`/`clothing` records in sensible D35E equipment slots instead of disappearing into `slotless`.
- Fixed aggregate armor weight so the generated aggregate contributes `0` carried weight while retaining the real component weight total in the module summary and preview.
- Added multi-location coverage parsing for armor components and called-shot profiles using comma, semicolon, pipe, slash, or newline separators.
- Improved local armor AC matching so a component such as `head; eyes; ears` can match called shots to Head, Eye, or Ear and is counted only once.
- Updated item-sheet and profile-editor copy to label these fields as `Coverage slot(s)`.

## 1.0.5

- Fixed called-shot location metadata on native D35E damage cards so live Apply Damage clicks can apply local armor AC.
- Removed piecemeal-component configuration controls from generated aggregate armor items to avoid confusing the sync workflow.

## 1.0.4

- Added optional called-shot local armor AC support in D35E's native Apply Damage workflow.
- Called-shot damage cards now carry location metadata into the D35E hit check without editing D35E system files.
- Added a world setting for local armor AC modes: adjust AC, show adjustment only, or disabled.
- Added local armor tests for slot normalization, weaker and stronger locations, missing data, touch AC skipping, and Apply Damage context handling.
- Updated public docs and package listing notes for the new Apply Damage AC behavior.

## 1.0.3

- Added a Foundry Package Release API publisher for the GitHub release workflow.
- Updated public package listing docs and Foundry package-page text to the current release.
- Replaced public package screenshots with live Foundry VTT captures.
- Tightened public-surface validation so stale release-version examples are caught before handoff.

## 1.0.2

- Fixed the D35E equipment item sheet placement for the `Piecemeal Armor` fieldset so it appears in the visible `Details` tab instead of being appended outside the tab layout.
- Changed piecemeal armor sync to treat flagged component items as module-managed records by default, so pieces no longer need to occupy D35E armor slots before syncing.
- Added component support for miscellaneous equipment records that carry armor values through the module fieldset.
- Reduced inventory noise by showing armor chips only on marked, synced, or aggregate items.
- Clarified support and armor-component workflow docs for GitHub issue reports, armor-vs-miscellaneous items, and aggregate-only D35E AC math.

## 1.0.1

- Fixed piecemeal armor sync so generated aggregate armor is explicitly equipped after D35E creates or updates it.
- Made armor sync a no-op when no equipped piecemeal armor pieces are present, preventing zero-value aggregate armor items.
- Fixed native attack-form parsing when Foundry passes an actual HTML form element, preserving called-shot selection and per-attack full-attack queues.
- Improved the empty armor-sync dialog with direct setup guidance and only relevant action buttons.
- Improved called-shot chat outcome button labels and accessibility text.
- Added friendly error reporting for invalid called-shot profile JSON imports.
- Polished README, user guide, package listing, and release docs for end-user install and configuration discovery.

## 1.0.0

- Prepared the first public GitHub release package.
- Moved called-shot selection into D35E's native attack/use dialog.
- Added configurable full-attack called-shot behavior: per attack, first attack only, every attack, or disabled.
- Removed module-owned called-shot actor-sheet panels, attack-row launchers, and item-sheet called-shot launchers.
- Kept called-shot penalties inside D35E's native attack math and expanded roll breakdown.
- Added piecemeal armor component flags, aggregate preview/sync, and restore helpers.
- Added inventory armor chips and item-sheet piecemeal armor fields.
- Added configurable called-shot profiles with PF1e-derived defaults.
- Added GM-confirmed called-shot outcome chat cards.
- Added a Foundry v14 called-shot profile manager.
- Added validation, public-surface checks, release packaging, and GitHub Actions.

## 0.1.0

- Internal pre-release implementation milestone.
