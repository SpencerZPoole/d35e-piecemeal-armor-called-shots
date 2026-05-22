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

## v1.0.0 GitHub Release

Expected assets:

- `module.json`
- `d35e-piecemeal-armor-called-shots-v1.0.0.zip`

Expected URLs:

- Latest install manifest: `https://github.com/SpencerZPoole/d35e-piecemeal-armor-called-shots/releases/latest/download/module.json`
- Versioned manifest: `https://github.com/SpencerZPoole/d35e-piecemeal-armor-called-shots/releases/download/v1.0.0/module.json`
- Versioned zip: `https://github.com/SpencerZPoole/d35e-piecemeal-armor-called-shots/releases/download/v1.0.0/d35e-piecemeal-armor-called-shots-v1.0.0.zip`

## Automated Release

The `Release` GitHub Action runs when a `v*.*.*` tag is pushed. It validates the module, confirms that the tag matches `package.json`, builds the release zip, and publishes the GitHub release assets.

Manual publish can use the same artifact layout:

```powershell
gh release create v1.0.0 dist/module.json dist/d35e-piecemeal-armor-called-shots-v1.0.0.zip --title v1.0.0 --notes-file docs/release-notes/v1.0.0.md
```

## Foundry Package Listing

Use `docs/foundry-package-listing.md` as the submission packet. Foundry's version entry should use the versioned release manifest, not the `latest` manifest URL.
