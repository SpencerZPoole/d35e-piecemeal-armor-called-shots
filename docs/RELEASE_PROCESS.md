# Release Process

This repository publishes Foundry VTT module releases through GitHub release assets.

## Local Checklist

1. Update `module.json`, `package.json`, `CHANGELOG.md`, and release notes.
2. Run validation:

   ```powershell
   npm run validate
   ```

3. Build the Foundry package:

   ```powershell
   npm run build:release
   ```

4. Inspect the package contents. `module.json` must be at the zip root.
5. Run the local security gate:

   ```powershell
   node <path-to-local-security-scan.mjs> --root <module-root> --changed-only
   node <path-to-local-security-scan.mjs> --root <module-root>\dist
   ```

6. Smoke test in a scratch D35E world:
   - module settings show `Rules mode` and default to RAW-adapted automation;
   - native attack dialog has `Called Shot`;
   - single attack shows a native modifier such as `Called Shot: Ear -10`;
   - RAW-adapted Improved/Greater full-attack behavior works, and legacy mode preserves permissive policies;
   - actor-sheet called-shot panel is absent;
   - native armor profile works for baseline-only armor, one override, clear profile, and legacy migration;
   - D35E Apply Damage triggers local armor AC, severity, automatic outcomes, and target ledger restore;
   - profile editor opens and saves.

## Foundry Package Release Token

The automated Foundry publish step expects a GitHub Actions secret named `FOUNDRY_PACKAGE_RELEASE_TOKEN`. The token comes from the Foundry package edit page and is package-specific. Store it only as a GitHub Actions secret or local environment variable; do not commit it to the repository, print it in logs, or paste it into release notes.

## GitHub Release

Expected assets for each `vX.Y.Z` release:

- `module.json`
- `d35e-piecemeal-armor-called-shots-vX.Y.Z.zip`

Expected URLs:

- Latest install manifest: `https://github.com/SpencerZPoole/d35e-piecemeal-armor-called-shots/releases/latest/download/module.json`
- Versioned manifest: `https://github.com/SpencerZPoole/d35e-piecemeal-armor-called-shots/releases/download/vX.Y.Z/module.json`
- Versioned zip: `https://github.com/SpencerZPoole/d35e-piecemeal-armor-called-shots/releases/download/vX.Y.Z/d35e-piecemeal-armor-called-shots-vX.Y.Z.zip`

## Automated Release

The `Release` GitHub Action runs when a `v*.*.*` tag is pushed. It validates the module, confirms that the tag matches `package.json`, builds the release zip, publishes the GitHub release assets, and then publishes the version to the Foundry package listing when `FOUNDRY_PACKAGE_RELEASE_TOKEN` is configured.

Manual publish can use the same artifact layout:

```powershell
gh release create vX.Y.Z dist/module.json dist/d35e-piecemeal-armor-called-shots-vX.Y.Z.zip --title vX.Y.Z --notes-file docs/release-notes/vX.Y.Z.md
npm run publish:foundry:dry-run
npm run publish:foundry
```

## Foundry Package Listing

Use `docs/foundry-package-listing.md` as the submission packet. Foundry's version entry should use the versioned release manifest, not the `latest` manifest URL. After any public GitHub release, verify the Foundry package page shows the new version, compatibility, and current description.
