# AGENTS.md - d35e-piecemeal-armor-called-shots

## Project Guidance

- Keep changes narrow, compatible with Foundry VTT 14 and the D35E system, and aligned with the existing module structure.
- Treat README, docs, screenshots, release notes, `module.json`, and the Foundry package page as release surfaces, not afterthoughts.
- Do not use AI-generated or mock screenshots for public module documentation. Use live Foundry screenshots from a running app session whenever screenshots are updated.
- Follow the official Foundry VTT module-development guidance when changing manifest metadata, compatibility, module structure, release packaging, or installation URLs: https://foundryvtt.com/article/module-development/
- A public release is not complete after pushing GitHub tags alone. Publish or verify the matching version on the Foundry VTT package listing using the package release workflow/API, then confirm the public package page shows the expected version, compatibility, manifest link, download link, and description.

## Validation

- Run `npm run validate` before release.
- Run `npm run build:release` before publishing release assets.
- Run the local security gate after code, package, release, or documentation changes that could affect public packaging or credential safety.
