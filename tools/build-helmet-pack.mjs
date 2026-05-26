import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const manifestPath = path.join(root, "module.json");
const sourcePath = path.join(root, "data", "helmets.json");
const packPath = path.join(root, "packs", "helmets");
const moduleId = "d35e-piecemeal-armor-called-shots";

function assertProjectRoot() {
  if (!fs.existsSync(manifestPath)) throw new Error("module.json was not found; run this script from the module root.");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.id !== moduleId) throw new Error(`refusing to build pack for unexpected module id: ${manifest.id}`);
  const relativePackPath = path.relative(root, packPath).replace(/\\/g, "/");
  if (relativePackPath !== "packs/helmets") throw new Error(`refusing to replace unexpected pack path: ${relativePackPath}`);
}

function classicLevelCandidates() {
  const candidates = [];
  if (process.env.FOUNDRY_CLASSIC_LEVEL) candidates.push(process.env.FOUNDRY_CLASSIC_LEVEL);
  if (process.env.PROGRAMFILES) {
    candidates.push(path.join(process.env.PROGRAMFILES, "Foundry Virtual Tabletop", "resources", "app", "node_modules", "classic-level", "index.js"));
  }
  return candidates;
}

async function loadClassicLevel() {
  try {
    return await import("classic-level");
  } catch (_error) {
    for (const candidate of classicLevelCandidates()) {
      if (fs.existsSync(candidate)) return import(pathToFileURL(candidate));
    }
  }
  throw new Error("classic-level was not found. Set FOUNDRY_CLASSIC_LEVEL to Foundry's classic-level index.js.");
}

const { ClassicLevel } = await loadClassicLevel();
assertProjectRoot();
const documents = JSON.parse(fs.readFileSync(sourcePath, "utf8"));

fs.rmSync(packPath, { recursive: true, force: true });
fs.mkdirSync(packPath, { recursive: true });

const db = new ClassicLevel(packPath, { valueEncoding: "utf8" });
await db.open();
for (const document of documents) {
  await db.put(`!items!${document._id}`, JSON.stringify(document));
}
await db.close();

console.log(`build-helmet-pack: wrote ${documents.length} item(s) to ${path.relative(root, packPath)}`);
