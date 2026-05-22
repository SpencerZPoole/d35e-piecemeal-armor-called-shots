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

console.log("check-public-surface: ok");
