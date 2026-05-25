# Changelog

## Unreleased

- Reworked the native profile presentation into D35E inventory slots: the normal `Armor` slot is the baseline and `PAcS: Torso`, `PAcS: Arms`, and `PAcS: Legs` are module-owned override slots.
- Fixed profile baseline resolution and hidden carrier slot behavior so explicit PAcS-only setups do not inherit stale native armor AC and the hidden carrier no longer occupies the visible Armor slot.
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
