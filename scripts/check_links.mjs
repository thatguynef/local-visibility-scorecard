#!/usr/bin/env node
/** Check relative Markdown links for broken targets. */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const HELP = `Local Visibility Scorecard — link checker

Usage:
  node scripts/check_links.mjs

Checks tracked and untracked, non-ignored Markdown files for broken relative
links. Remote URLs are not fetched.
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

const broken = [];
for (const file of files) {
  const absolute = path.join(ROOT, file);
  if (!fs.existsSync(absolute)) continue;
  let text = fs.readFileSync(absolute, "utf8");
  text = text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  const targets = [];
  for (const match of text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) targets.push(match[1]);
  for (const match of text.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) targets.push(match[1]);
  for (const match of text.matchAll(/<source\b[^>]*\bsrcset\s*=\s*["']([^"']+)["']/gi)) {
    for (const candidate of match[1].split(",")) targets.push(candidate.trim().split(/\s+/)[0]);
  }
  for (const raw of targets) {
    let target = raw.trim();
    if (!target || target.startsWith("#") || target.startsWith("/") || /^(https?:|mailto:|tel:|sms:|data:)/i.test(target)) continue;
    target = target.split("#")[0].split("?")[0];
    if (!target || target.includes("{{")) continue;
    try {
      target = decodeURI(target);
    } catch {
      // Keep the raw target.
    }
    const resolved = path.resolve(path.dirname(absolute), target);
    if (!fs.existsSync(resolved)) broken.push(`${file} -> ${raw}`);
  }
}

console.log(`Checked ${files.length} Markdown files.`);
for (const item of broken) console.error(`FAIL  ${item}`);
if (broken.length) {
  console.error(`\n${broken.length} broken relative link(s).`);
  process.exit(1);
}
console.log("ok: no broken relative links.");
