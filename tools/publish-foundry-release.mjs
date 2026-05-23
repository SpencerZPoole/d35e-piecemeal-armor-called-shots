import fs from "node:fs";

const manifest = JSON.parse(fs.readFileSync("module.json", "utf8"));
const dryRun = process.argv.includes("--dry-run");
const token = process.env.FOUNDRY_PACKAGE_RELEASE_TOKEN;

function fail(message) {
  console.error(`publish-foundry-release: ${message}`);
  process.exit(1);
}

if (!manifest.id) fail("module.json is missing id.");
if (!manifest.version) fail("module.json is missing version.");
if (!manifest.compatibility?.minimum) fail("module.json compatibility.minimum is required.");
if (!manifest.compatibility?.verified) fail("module.json compatibility.verified is required.");
if (!manifest.download?.includes(`/releases/download/v${manifest.version}/`)) {
  fail(`module.json download must point at the v${manifest.version} release asset.`);
}
if (!token) {
  fail("FOUNDRY_PACKAGE_RELEASE_TOKEN is not set.");
}

const release = {
  version: manifest.version,
  manifest: `https://github.com/SpencerZPoole/${manifest.id}/releases/download/v${manifest.version}/module.json`,
  notes: `https://github.com/SpencerZPoole/${manifest.id}/releases/tag/v${manifest.version}`,
  compatibility: {
    minimum: String(manifest.compatibility.minimum),
    verified: String(manifest.compatibility.verified),
    maximum: String(manifest.compatibility.maximum ?? "")
  }
};

const body = {
  id: manifest.id,
  release
};

if (dryRun) body["dry-run"] = true;

const response = await fetch("https://foundryvtt.com/_api/packages/release_version/", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: token
  },
  body: JSON.stringify(body)
});

const text = await response.text();
let payload;
try {
  payload = JSON.parse(text);
} catch {
  payload = { raw: text };
}

if (!response.ok || payload.status === "error") {
  console.error(JSON.stringify(payload, null, 2));
  fail(`Foundry API returned HTTP ${response.status}.`);
}

console.log(
  `publish-foundry-release: ${dryRun ? "dry run " : ""}published ${manifest.id} v${manifest.version}`
);
if (payload.page) console.log(`publish-foundry-release: ${payload.page}`);
