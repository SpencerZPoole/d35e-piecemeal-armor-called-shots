import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");
const stageDir = path.join(distDir, "_stage");

const moduleManifestPath = path.join(root, "module.json");
const packageManifestPath = path.join(root, "package.json");
const moduleManifest = JSON.parse(fs.readFileSync(moduleManifestPath, "utf8"));
const packageManifest = JSON.parse(fs.readFileSync(packageManifestPath, "utf8"));

const moduleId = moduleManifest.id;
const version = moduleManifest.version;
const zipName = `${moduleId}-v${version}.zip`;
const zipPath = path.join(distDir, zipName);
const expectedDownload = `https://github.com/SpencerZPoole/${moduleId}/releases/download/v${version}/${zipName}`;

const releaseEntries = [
  "module.json",
  "LICENSE.md",
  "README.md",
  "CHANGELOG.md",
  "SECURITY.md",
  "lang",
  "packs",
  "scripts",
  "styles",
  "templates",
  "docs"
];

const blockedExtensions = new Set([
  ".db",
  ".sqlite",
  ".sqlite3",
  ".pdf",
  ".zip",
  ".log",
  ".tmp",
  ".bak"
]);

function fail(message) {
  console.error(`build-release: ${message}`);
  process.exit(1);
}

function copyEntry(relativePath) {
  const source = path.join(root, relativePath);
  const target = path.join(stageDir, relativePath);
  if (!fs.existsSync(source)) return;

  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const child of fs.readdirSync(source)) {
      if (child.startsWith(".")) continue;
      copyEntry(path.join(relativePath, child));
    }
    return;
  }

  const extension = path.extname(source).toLowerCase();
  if (blockedExtensions.has(extension) && !isPackDatabaseArtifact(relativePath, extension)) {
    fail(`refusing to package blocked file type: ${path.relative(root, source)}`);
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function isPackDatabaseArtifact(relativePath, extension = path.extname(relativePath).toLowerCase()) {
  const normalized = relativePath.replace(/\\/g, "/");
  if (!normalized.startsWith("packs/")) return false;
  const basename = path.basename(normalized);
  return extension === ".ldb" ||
    extension === ".log" ||
    ["CURRENT", "LOCK", "LOG", "LOG.old"].includes(basename) ||
    /^MANIFEST-\d+$/i.test(basename);
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function runZip() {
  if (process.platform === "win32") {
    const command = [
      "$ErrorActionPreference = 'Stop'",
      `Compress-Archive -Path ${psQuote(path.join(stageDir, "*"))} -DestinationPath ${psQuote(zipPath)} -Force`
    ].join("; ");
    const result = spawnSync("powershell", ["-NoProfile", "-Command", command], {
      cwd: root,
      stdio: "inherit"
    });
    if (result.status !== 0) fail("PowerShell Compress-Archive failed.");
    return;
  }

  const result = spawnSync("zip", ["-r", zipPath, "."], {
    cwd: stageDir,
    stdio: "inherit"
  });
  if (result.status !== 0) fail("zip command failed.");
}

if (!moduleId) fail("module.json is missing id.");
if (packageManifest.name !== moduleId) {
  fail(`package name ${packageManifest.name} does not match module id ${moduleId}.`);
}
if (packageManifest.version !== version) {
  fail(`package version ${packageManifest.version} does not match module version ${version}.`);
}
if (moduleManifest.download !== expectedDownload) {
  fail(`module.json download must be ${expectedDownload}`);
}
if (!moduleManifest.manifest?.endsWith("/releases/latest/download/module.json")) {
  fail("module.json manifest should point to the latest GitHub release module.json asset.");
}

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(stageDir, { recursive: true });

for (const entry of releaseEntries) copyEntry(entry);
fs.copyFileSync(moduleManifestPath, path.join(distDir, "module.json"));

runZip();

const zipStat = fs.statSync(zipPath);
if (!zipStat.size) fail("release zip was created but is empty.");
fs.rmSync(stageDir, { recursive: true, force: true });

console.log(`build-release: wrote ${path.relative(root, path.join(distDir, "module.json"))}`);
console.log(`build-release: wrote ${path.relative(root, zipPath)} (${zipStat.size} bytes)`);
