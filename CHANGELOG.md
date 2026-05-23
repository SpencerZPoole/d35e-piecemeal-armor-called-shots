# Changelog

## Unreleased

- No unreleased changes yet.

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
