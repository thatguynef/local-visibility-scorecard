#!/usr/bin/env node
/** Validate documentation images: existence, alt text, budgets, and safe paths. */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ASSETS = path.join(ROOT, "docs", "assets");
const HELP = `Local Visibility Scorecard — asset checker

Usage:
  node scripts/check_assets.mjs

Checks tracked and untracked Markdown image references: existence, alt text,
size budgets, safe paths, and SVG title elements. Remote URLs are not fetched.
`;

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(HELP);
  process.exit(0);
}

let files;
try {
  files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  })
    .split("\n")
    .filter((file) => file.endsWith(".md"));
} catch (error) {
  console.error(`error: could not list files: ${error.message}`);
  process.exit(2);
}

const BUDGETS = new Map([
  [".svg", 300 * 1024],
  [".png", 500 * 1024],
  [".jpg", 500 * 1024],
  [".jpeg", 500 * 1024],
  [".webp", 500 * 1024],
  [".gif", 2 * 1024 * 1024],
]);
const FORBIDDEN = [
  [/^\.audit\//, "raw audit evidence"],
  [/^audit-screens\//, "raw screenshot evidence"],
  [/^reports\//, "client report"],
  [/^evals\//, "eval evidence"],
  [/^private-fixtures\//, "private fixture"],
  [/^raw-api\//, "raw API response"],
];
const errors = [];
const warnings = [];
const seen = new Set();

function checkTarget(file, rawTarget, alt, hasAltAttr) {
  let target = rawTarget.trim();
  if (!target || target.startsWith("#") || /^(https?:|data:|mailto:|tel:)/i.test(target)) return;
  target = target.split("#")[0].split("?")[0];
  if (!target || target.includes("{{")) return;
  try {
    target = decodeURI(target);
  } catch {
    // Keep the raw target.
  }
  const resolved = path.resolve(path.dirname(path.join(ROOT, file)), target);
  const relative = path.relative(ROOT, resolved).split(path.sep).join("/");
  for (const [pattern, label] of FORBIDDEN) {
    if (pattern.test(relative)) {
      errors.push(`${file}: references ${label} (${relative})`);
      return;
    }
  }
  if (!fs.existsSync(resolved)) {
    errors.push(`${file}: missing image ${rawTarget}`);
    return;
  }
  if (!hasAltAttr && !String(alt || "").trim()) errors.push(`${file}: image has no alt text (${rawTarget})`);
  const key = `${file} -> ${relative}`;
  if (seen.has(key)) return;
  seen.add(key);
  const ext = path.extname(resolved).toLowerCase();
  const budget = BUDGETS.get(ext);
  if (!budget) {
    warnings.push(`${file}: ${ext || "no extension"} is not a recognised image type (${relative})`);
    return;
  }
  const bytes = fs.statSync(resolved).size;
  if (bytes > budget) errors.push(`${file}: ${relative} is ${(bytes / 1024).toFixed(0)} KB, over the ${(budget / 1024).toFixed(0)} KB budget`);
  if (ext === ".svg") {
    const svg = fs.readFileSync(resolved, "utf8");
    if (!/<title[\s>]/i.test(svg)) errors.push(`${file}: SVG has no <title> for screen readers (${relative})`);
    if (/https?:\/\//i.test(svg.replace(/xmlns(:\w+)?="[^"]*"/g, ""))) warnings.push(`${file}: SVG references an external URL (${relative})`);
  }
}

for (const file of files) {
  const absolute = path.join(ROOT, file);
  if (!fs.existsSync(absolute)) continue;
  let text = fs.readFileSync(absolute, "utf8").replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  for (const match of text.matchAll(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    checkTarget(file, match[2], match[1], false);
  }
  for (const match of text.matchAll(/<img\b([^>]*)>/gi)) {
    const attrs = match[1];
    const src = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!src) continue;
    const hasAlt = /\balt\s*=/i.test(attrs);
    const alt = attrs.match(/\balt\s*=\s*["']([^"']*)["']/i)?.[1] ?? "";
    checkTarget(file, src, alt, hasAlt);
  }
  for (const match of text.matchAll(/<source\b([^>]*)>/gi)) {
    const srcset = match[1].match(/\bsrcset\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!srcset) continue;
    for (const candidate of srcset.split(",")) {
      const target = candidate.trim().split(/\s+/)[0];
      if (target) checkTarget(file, target, "", true);
    }
  }
}

let total = 0;
if (fs.existsSync(ASSETS)) {
  for (const entry of fs.readdirSync(ASSETS, { withFileTypes: true })) {
    if (entry.isFile()) total += fs.statSync(path.join(ASSETS, entry.name)).size;
  }
}
if (total > 2 * 1024 * 1024) errors.push(`docs/assets totals ${(total / 1024).toFixed(0)} KB, over the 2048 KB budget`);

console.log(`Checked ${seen.size} image reference(s) across ${files.length} Markdown files.`);
for (const warning of [...new Set(warnings)]) console.log(`warn  ${warning}`);
for (const error of [...new Set(errors)]) console.error(`FAIL  ${error}`);
if (errors.length) {
  console.error(`\n${errors.length} asset problem(s).`);
  process.exit(1);
}
console.log(`ok: images exist, alt text is present, budgets respected (assets total ${(total / 1024).toFixed(0)} KB).`);
