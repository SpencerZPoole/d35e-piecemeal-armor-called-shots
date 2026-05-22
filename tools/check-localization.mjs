import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(root, "module.json"), "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const language of manifest.languages ?? []) {
  const fullPath = path.join(root, language.path);
  assert(fs.existsSync(fullPath), `Missing language file: ${language.path}`);
  const data = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  assert(Object.keys(data).length > 0, `${language.path} must contain at least one key`);
  for (const [key, value] of Object.entries(data)) {
    assert(key.startsWith("D35E-PACS."), `Localization key must use D35E-PACS prefix: ${key}`);
    assert(typeof value === "string" && value.trim().length > 0, `Localization value must be non-empty: ${key}`);
  }
}

console.log("check-localization: ok");
