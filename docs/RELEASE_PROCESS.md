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
   - native attack dialog has `Called Shot`;
   - single attack shows a native modifier such as `Called Shot: Ear -10`;
   - full-attack modes work;
   - actor-sheet called-shot panel is absent;
   - armor sync and restore still work;
   - profile editor opens and saves.

## GitHub Release

Expected assets for each `vX.Y.Z` release:

- `module.json`
- `d35e-piecemeal-armor-called-shots-vX.Y.Z.zip`

Expected URLs:

- Latest install manifest: `https://github.com/SpencerZPoole/d35e-piecemeal-armor-called-shots/releases/latest/download/module.json`
- Versioned manifest: `https://github.com/SpencerZPoole/d35e-piecemeal-armor-called-shots/releases/download/vX.Y.Z/module.json`
- Versioned zip: `https://github.com/SpencerZPoole/d35e-piecemeal-armor-called-shots/releases/download/vX.Y.Z/d35e-piecemeal-armor-called-shots-vX.Y.Z.zip`

## Automated Release

The `Release` GitHub Action runs when a `v*.*.*` tag is pushed. It validates the module, confirms that the tag matches `package.json`, builds the release zip, and publishes the GitHub release assets.

Manual publish can use the same artifact layout:

```powershell
gh release create vX.Y.Z dist/module.json dist/d35e-piecemeal-armor-called-shots-vX.Y.Z.zip --title vX.Y.Z --notes-file docs/release-notes/vX.Y.Z.md
```

## Foundry Package Listing

Use `docs/foundry-package-listing.md` as the submission packet. Foundry's version entry should use the versioned release manifest, not the `latest` manifest URL.
