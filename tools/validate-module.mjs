import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const manifest = readJson("module.json");
const pkg = readJson("package.json");

assert(manifest.id === "d35e-piecemeal-armor-called-shots", "module.json id mismatch");
assert(pkg.name === manifest.id, "package name must match module id");
assert(pkg.version === manifest.version, "package and manifest versions must match");
assert(Array.isArray(manifest.esmodules) && manifest.esmodules.length === 1, "manifest needs exactly one esmodule entry");
assert(Array.isArray(manifest.styles) && manifest.styles.length > 0, "manifest needs styles");
assert(manifest.relationships?.systems?.some((system) => system.id === "D35E"), "manifest needs D35E system relationship");
const armorPiecePack = manifest.packs?.find((pack) => pack.name === "armor-pieces");
assert(armorPiecePack, "manifest needs armor-pieces pack");
assert(armorPiecePack.label === "PAcS Armor Pieces", "armor-pieces label mismatch");
assert(armorPiecePack.type === "Item", "armor-pieces must be an Item pack");
assert(armorPiecePack.system === "D35E", "armor-pieces must declare D35E system");
assert(armorPiecePack.path === "packs/armor-pieces", "armor-pieces path mismatch");
const featPack = manifest.packs?.find((pack) => pack.name === "called-shot-feats");
assert(featPack, "manifest needs called-shot-feats pack");
assert(featPack.label === "PAcS Called-Shot Feats", "called-shot-feats label mismatch");
assert(featPack.type === "Item", "called-shot-feats must be an Item pack");
assert(featPack.system === "D35E", "called-shot-feats must declare D35E system");
assert(featPack.path === "packs/called-shot-feats", "called-shot-feats path mismatch");
const helmetPack = manifest.packs?.find((pack) => pack.name === "helmets");
assert(helmetPack, "manifest needs helmets pack");
assert(helmetPack.label === "PAcS Helmets", "helmets label mismatch");
assert(helmetPack.type === "Item", "helmets must be an Item pack");
assert(helmetPack.system === "D35E", "helmets must declare D35E system");
assert(helmetPack.path === "packs/helmets", "helmets path mismatch");

for (const file of [
  "README.md",
  "CHANGELOG.md",
  "LICENSE.md",
  "SECURITY.md",
  "scripts/module.js",
  "styles/d35e-piecemeal-armor-called-shots.css",
  "lang/en.json",
  "templates/called-shot-profile-editor.hbs"
]) {
  assert(fs.existsSync(path.join(root, file)), `Missing required file: ${file}`);
}

assert(fs.existsSync(path.join(root, featPack.path)), `Missing pack path: ${featPack.path}`);
assert(fs.existsSync(path.join(root, helmetPack.path)), `Missing pack path: ${helmetPack.path}`);
assert(fs.existsSync(path.join(root, armorPiecePack.path)), `Missing pack path: ${armorPiecePack.path}`);

console.log("validate-module: ok");
