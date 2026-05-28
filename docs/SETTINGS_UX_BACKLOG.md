# Settings UX Backlog

These notes track the settings cleanup decisions from the native PAcS armor workflow pass. They are not release notes.

## Implemented Direction

- The normal settings menu now focuses on table-facing controls: `Enable piecemeal armor`, `Enable called shots`, optional exposed head/hand house rules, optional helmet Spot/Listen penalties, `Called-shot effect automation`, full-attack behavior, location overlay, and the called-shot profile editor.
- The old rules-mode setting is hidden from the normal UI. RAW-adapted armor and called-shot workflow behavior is the normal runtime path.
- The old piecemeal workflow setting is hidden from the normal UI. The native D35E inventory workflow is the normal workflow; old aggregate behavior remains internal migration/recovery support.
- Local armor AC is no longer a visible mode setting. Called-shot AC stays on the RAW-adapted full-AC baseline unless an optional exposed head/hand setting applies.
- GM-only profile/source metadata is fixed behavior. Players see useful called-shot results; GMs always see the extra adjudication context.

## Follow-Up Watchlist

- Live-smoke the settings menu after any screenshot refresh so public docs match the actual Foundry settings order.
- Revisit outcome automation labels only if playtest feedback shows GMs misunderstand `GM confirms severe effects`, `Apply effects automatically`, or `Advisory only`.
- Keep legacy aggregate recovery out of the primary UI unless a real migration support issue requires a clearly marked troubleshooting tool.
