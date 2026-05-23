import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const blocked = [
  { id: "windows-user-path", pattern: new RegExp(["C:", "Users"].join("[\\\\/]"), "i") },
  { id: "workspace-path", pattern: new RegExp(["Dungeons", "And", "Dragons", "DM", "Folder"].join(""), "i") },
  { id: "active-world-name", pattern: new RegExp(["Return", "to", "Undermountain"].join("\\\\s+"), "i") },
  { id: "private-campaign-party", pattern: new RegExp(["Something", "Sylvan"].join("\\\\s+"), "i") }
];

const allowedExtensions = new Set([".js", ".mjs", ".json", ".md", ".css", ".hbs", ".txt"]);
const blockedFileExtensions = new Set([".db", ".sqlite", ".sqlite3", ".pdf", ".zip", ".log", ".tmp", ".bak"]);
const ignoredDirs = new Set([".git", "node_modules", "dist", "build"]);

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(fullPath));
    else {
      const extension = path.extname(entry.name).toLowerCase();
      if (blockedFileExtensions.has(extension)) files.push(fullPath);
      else if (allowedExtensions.has(extension)) files.push(fullPath);
    }
  }
  return files;
}

const findings = [];
for (const file of walk(root)) {
  const rel = path.relative(root, file);
  if (blockedFileExtensions.has(path.extname(file).toLowerCase())) {
    findings.push(`${rel}: blocked-release-artifact`);
    continue;
  }
  const text = fs.readFileSync(file, "utf8");
  for (const rule of blocked) {
    if (rule.pattern.test(text)) findings.push(`${rel}: ${rule.id}`);
  }
}

if (findings.length) {
  console.error(findings.join("\n"));
  throw new Error("Public surface check failed.");
}

const requiredPublicText = [
  {
    file: "README.md",
    text: "go to the `Details` tab"
  },
  {
    file: "docs/USER_GUIDE.md",
    text: "module-managed component record"
  },
  {
    file: "docs/USER_GUIDE.md",
    text: "GitHub issues are the preferred place"
  },
  {
    file: "docs/USER_GUIDE.md",
    text: "The generated aggregate item is the piece that contributes D35E armor AC after sync."
  },
  {
    file: "scripts/ui.js",
    text: "app?.object"
  },
  {
    file: "scripts/ui.js",
    text: "Mark at least one carried, unbroken equipment item"
  }
];

for (const requirement of requiredPublicText) {
  const text = fs.readFileSync(path.join(root, requirement.file), "utf8");
  if (!text.includes(requirement.text)) {
    throw new Error(`${requirement.file} is missing required public guidance: ${requirement.text}`);
  }
}

console.log("check-public-surface: ok");
