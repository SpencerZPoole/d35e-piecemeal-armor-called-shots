# Settings UX Backlog

Working notes for a future settings-menu cleanup pass. These are not release notes and do not describe current behavior.

## Goal

Make the module settings read like table-facing options instead of implementation switches. The settings page should emphasize the two things a GM understands immediately:

- piecemeal armor on or off;
- called shots on or off, with clear choices for automation and full attacks.

Avoid exposing legacy/developer terms in the normal settings experience unless they are genuinely needed for migration or troubleshooting.

## Candidate Changes

### Remove legacy aggregate workflow from the normal UI

The current `Piecemeal armor workflow` setting exposes `Native armor profile` and `Legacy aggregate sync`.

Desired direction:

- make the native PAcS armor-slot workflow the only normal user-facing workflow;
- remove or hide `Legacy aggregate sync` from the regular settings menu;
- keep any needed old-world migration/recovery logic internal or behind a clearly marked troubleshooting tool;
- update docs so users are not taught to think about the old aggregate workflow.

Rationale: the current native armor slot design is the intended user experience. Keeping the legacy aggregate option visible makes the module feel more technical and less cohesive.

### Replace `Rules mode` with an outcome automation setting

The current `Rules mode` setting mixes several concepts: RAW-adapted behavior, feat/action limits, severity handling, and legacy manual outcomes.

Desired direction:

- remove the abstract `Rules mode` label from the normal UI;
- replace it with a clearer setting focused on called-shot outcome automation;
- possible labels to evaluate:
  - `Called-shot effect automation`;
  - `Severe called-shot effects`;
  - `Called-shot outcome handling`.

Possible modes to design:

- `GM confirms severe effects`: calculate the outcome and ask before applying lethal, permanent, or extreme effects;
- `Apply effects automatically`: apply configured outcomes directly after D35E Apply Damage resolves;
- `Advisory only`: show the outcome card/details but do not change actor data automatically.

Open question: decide whether feat/action enforcement belongs in this same setting or should remain part of the normal called-shot workflow when called shots are enabled.

### Rename piecemeal armor toggle

The current `Enable piecemeal armor automation` label and description feel unclear.

Desired direction:

- replace it with a plain toggle such as `Enable piecemeal armor`;
- make the description say that it enables the PAcS torso/arms/legs inventory slots, piecemeal armor math, hidden carrier, and local armor data;
- make clear that disabling it does not disable called shots.

Open question: confirm what should happen to actors that already have active PAcS slots when this setting is disabled.

### Rename called-shot toggle

The current `Enable called shot helper` label sounds like an add-on tool rather than the called-shot workflow.

Desired direction:

- rename it to `Enable called shots` or `Enable called-shot workflow`;
- describe it as adding the D35E attack-dialog selector, attack penalties, full-attack handling, Apply Damage context, and outcome cards/effects;
- make clear that disabling it does not disable piecemeal armor.

### Keep full-attack behavior, but review wording

The current `Called shots on full attacks` setting still seems useful.

Desired direction:

- keep the behavior;
- review labels/descriptions after the outcome automation setting is redesigned;
- make sure the setting text explains what a GM actually decides at the table.

### Rework or remove `Called-shot local armor AC`

The current `Called-shot local armor AC` setting is not obvious from its label or description.

Current behavior to preserve or reconsider:

- when enabled, a called shot carried into D35E Apply Damage replaces the target's total armor-profile contribution with the matching location armor value;
- `Show adjustment only` displays the AC Details row without changing the hit/crit check;
- `Disabled` leaves D35E's AC check alone.

Desired direction:

- decide whether this should remain configurable, become a simpler toggle, or become the default behavior whenever both called shots and piecemeal armor are enabled;
- possible clearer label: `Use location armor for called shots`;
- possible description: `When a called shot targets a covered location, D35E Apply Damage checks that location's armor instead of the whole armor profile.`;
- if kept as a mode setting, rename modes to plain table language.

Open question: this may need a focused design conversation because the feature is mechanically useful but currently hard to explain.

### Clarify GM-only called-shot details

The current `Show GM-only called shot details` setting may still be useful, but the user-facing meaning is unclear.

Desired direction:

- clarify exactly what is GM-only metadata versus what players should always see;
- preserve player-visible called-shot results when appropriate;
- keep GM-only source/profile/outcome debugging context if it helps adjudication;
- review chat card layout and labels as part of the same pass.

Open question: determine whether this should remain a setting or become a fixed behavior where rules metadata is GM-only and visible outcome summaries are shared.

## Follow-Up Work

- Audit current settings registration keys and migration impact before removing any setting.
- Update `README.md`, `docs/USER_GUIDE.md`, `docs/ARCHITECTURE.md`, and package-listing text after behavior/labels are finalized.
- Add tests for setting defaults, disabled subsystem behavior, and backward compatibility.
- Live-playtest the settings menu as a first-time GM before release.
