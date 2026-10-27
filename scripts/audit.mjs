#!/usr/bin/env node
/**
 * Entrypoint for a Local Visibility Scorecard run.
 *
 * It collects normalized observations, creates a local report directory, and
 * prints the exact review/score/render/verify commands. The stages remain
 * independently runnable. It never scores an unfilled worksheet.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const HELP = `Local Visibility Scorecard — audit entrypoint 1.0.0

Usage:
  npm run audit -- --fixture <raw.json> [options]
  npm run audit -- --config <market.json> [options]

Required live mode:
  --config <json>          Market configuration (see config/market.example.json)

Recommended:
  --slug <slug>            Output slug, default: slugified business
  --run-id <id>            Default: local date-time
  --out <dir>              Raw output, default: .audit/<slug>/<run-id>
  --report-dir <dir>       Report package, default: reports/<slug>/<run-id>
  --prepare                Copy the raw worksheet to audit.filled.json for review

Live safety:
  --plan | --dry-run       Show task counts and ceilings; send no paid request
  --max-serp-tasks <n>
  --max-ai-tasks <n>
  --max-cost-usd <n>       Requires --pricing with real local prices
  --pricing <json>
  --grid-size <n>
  --ai-repeats <n>
  --max-queries <n>
  --allow-over-budget

Environment:
  DATAFORSEO_LOGIN         Read from the shell only; never from .env
  DATAFORSEO_PASSWORD      Read from the shell only; never from .env

The collector is read-only. It does not call, text, book, submit a form, or
change a profile.
`;

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) return true;
  return value;
}
const has = (name) => process.argv.includes(`--${name}`);
const shellQuote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;
const localRunId = (now = new Date()) =>
  new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16).replace(/:/g, "");

if (has("help") || process.argv.includes("-h")) {
  console.log(HELP);
  process.exit(0);
}

const fixture = arg("fixture");
const config = arg("config");
if (!fixture && !config) {
  console.error("error: provide --fixture for fixture mode or --config for live mode\n");
  console.error(HELP);
  process.exit(2);
}
if (fixture === true || config === true) {
  console.error("error: --fixture and --config require a path");
  process.exit(2);
}

function slugify(value) {
  return (
    String(value || "business")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "business"
  );
}
let defaultSlug = fixture ? "fixture" : "business";
if (!fixture && config) {
  try {
    const marketConfig = JSON.parse(fs.readFileSync(path.resolve(config), "utf8"));
    defaultSlug = slugify(marketConfig.business?.name || marketConfig.business?.domain || "business");
  } catch {
    // The collector will report a readable configuration error.
  }
}
const slug = slugify(arg("slug", defaultSlug));
const runId = String(arg("run-id", localRunId()));
const out = String(arg("out", path.join(".audit", slug, runId)));
const reportDirArg = arg("report-dir");
const reportDir = String(reportDirArg || path.join("reports", slug, runId));
if (reportDirArg === true) {
  console.error("error: --report-dir requires a path");
  process.exit(2);
}

const collectPath = path.join(
  import.meta.dirname,
  "..",
  ".opencode",
  "skills",
  "home-service-local-visibility-audit",
  "scripts",
  "collect.mjs",
);
const collectArgs = [collectPath, "--out", out, "--run-id", runId];
if (fixture) collectArgs.push("--fixture", String(fixture));
else collectArgs.push("--config", String(config));
for (const name of [
  "plan",
  "dry-run",
  "max-serp-tasks",
  "max-ai-tasks",
  "max-cost-usd",
  "pricing",
  "grid-size",
  "ai-repeats",
  "max-queries",
  "allow-over-budget",
  "no-cache",
  "cache-dir",
  "universe",
]) {
  const value = arg(name);
  if (value === undefined) continue;
  if (value === true) collectArgs.push(`--${name}`);
  else collectArgs.push(`--${name}`, String(value));
}

console.log(`\nCollecting normalized observations\nRaw directory: ${out}\n`);
const result = spawnSync(process.execPath, collectArgs, { stdio: "inherit" });
if (result.error) {
  console.error(`error: could not start collector: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status ?? 1);

if (has("plan") || has("dry-run")) {
  process.exit(0);
}

fs.mkdirSync(reportDir, { recursive: true });
const auditPath = path.resolve(out, "audit.json");
const filledPath = path.resolve(reportDir, "audit.filled.json");
const scoresPath = path.resolve(reportDir, "scores.json");
const contentPath = path.resolve(reportDir, "content.json");
const onePagePath = path.resolve(reportDir, "one-page.md");
const fullReportPath = path.resolve(reportDir, "full-report.md");
const verificationPath = path.resolve(reportDir, "verification.json");
if (has("prepare") && fs.existsSync(auditPath)) {
  fs.copyFileSync(auditPath, filledPath);
  console.log(`\nPrepared worksheet: ${filledPath}`);
  console.log("Fill the five judgment checks, then score.");
}

const skill = ".opencode/skills/home-service-local-visibility-audit/scripts";
console.log(`\nReport directory: ${reportDir}\n
1. Review the judgment checks. Fill ${auditPath}
   Save the completed audit as ${filledPath}
   Optional structured merge:
   node ${shellQuote(path.join(skill, "apply_judgment.mjs"))} \\
     --audit ${shellQuote(auditPath)} --judgment ${shellQuote(path.join(out, "judgment.json"))} \\
     --out ${shellQuote(filledPath)}
2. Score:
   python3 ${shellQuote(path.join(skill, "score.py"))} \\
     --input ${shellQuote(filledPath)} --out ${shellQuote(scoresPath)} \\
     --markdown ${shellQuote(path.join(reportDir, "scorecard.md"))} --strict
3. Write ${contentPath}, then render:
   node ${shellQuote(path.join(skill, "render.mjs"))} \\
     --scores ${shellQuote(scoresPath)} --content ${shellQuote(contentPath)} \\
     --out ${shellQuote(onePagePath)}
   node ${shellQuote(path.join(skill, "render.mjs"))} --mode full \\
     --scores ${shellQuote(scoresPath)} --content ${shellQuote(contentPath)} \\
     --out ${shellQuote(fullReportPath)}
4. Verify:
   node ${shellQuote(path.join(skill, "verify.mjs"))} --run ${shellQuote(reportDir)} \\
     --filled ${shellQuote(filledPath)} --scores ${shellQuote(scoresPath)} \\
     --content ${shellQuote(contentPath)} --report ${shellQuote(fullReportPath)} \\
     --one-page ${shellQuote(onePagePath)} --out ${shellQuote(verificationPath)} \\
     --mutation --synthetic
`);
