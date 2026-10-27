#!/usr/bin/env node
/**
 * Merge a validated judgment proposal into a filled audit.
 *
 *   node apply_judgment.mjs --audit audit.filled.json --judgment judgment.json --out audit.reviewed.json
 *
 * This script does not call a model. It accepts structured judgments only for
 * checks whose rubric evaluation is model_judgment. Deterministic checks must be
 * supplied by observation and are never changed here.
 */

import fs from "node:fs";
import path from "node:path";

const HELP = `Local Visibility Scorecard judgment merger 1.0.0

Usage:
  node apply_judgment.mjs --audit <filled.json> --judgment <proposal.json> --out <json> [options]

Required:
  --audit <json>          Filled or partially filled audit
  --judgment <json>       Structured judgment proposal
  --out <json>            Output audit

Optional:
  --allow-partial         Do not require every applicable judgment check
  --help

Rules:
  - only rubric checks with evaluation=model_judgment may be judged;
  - every judgment needs evidence and valid evidence_refs;
  - a deterministic check, owner-data ID, or unknown check fails;
  - a configured N/A check cannot be judged.
`;

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(HELP);
  process.exit(0);
}
function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) return true;
  return value;
}
const auditPath = arg("audit");
const judgmentPath = arg("judgment");
const outPath = arg("out");
if (!auditPath || !judgmentPath || !outPath) {
  console.error("error: --audit, --judgment, and --out are required");
  process.exit(2);
}
const readJson = (file) => JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
const rubric = readJson(path.join(import.meta.dirname, "..", "references", "rubric.json"));
let audit;
let judgment;
try {
  audit = readJson(auditPath);
  judgment = readJson(judgmentPath);
} catch (error) {
  console.error(`error: could not read input: ${error.message}`);
  process.exit(2);
}

const errors = [];
if (audit.schema_version !== "1.0" || audit.audit_mode !== "public") errors.push("audit must be public-mode schema 1.0");
if (judgment.schema_version !== "1.0" || judgment.audit_mode !== "public") errors.push("judgment must be public-mode schema 1.0");
if (!judgment.model || typeof judgment.model.name !== "string" || !judgment.model.name) errors.push("judgment.model.name is required");
if (!judgment.checks || typeof judgment.checks !== "object") errors.push("judgment.checks must be an object");
const byId = Object.fromEntries(rubric.items.map((item) => [item.id, item]));
const sourceIds = new Set((audit.sources || []).map((source) => source.id));
const judged = new Set();

for (const [cid, proposal] of Object.entries(judgment.checks || {})) {
  const item = byId[cid];
  if (!item) {
    errors.push(`${cid}: unknown check id`);
    continue;
  }
  if (item.evaluation !== "model_judgment") {
    errors.push(`${cid}: deterministic check cannot be model-judged`);
    continue;
  }
  const current = audit.checks?.[cid];
  if (!current) {
    errors.push(`${cid}: check is missing from the audit`);
    continue;
  }
  if (current.applicable === false) {
    errors.push(`${cid}: configured N/A check cannot be judged`);
    continue;
  }
  if (!Number.isInteger(proposal.score) || !item.allowed.includes(proposal.score)) {
    errors.push(`${cid}: score must be one of ${item.allowed.join(",")}`);
  }
  if (!["verified", "strong_signal"].includes(proposal.confidence)) {
    errors.push(`${cid}: confidence must be verified or strong_signal`);
  }
  if (!Array.isArray(proposal.evidence) || !proposal.evidence.length || proposal.evidence.some((entry) => typeof entry !== "string" || !entry.trim())) {
    errors.push(`${cid}: evidence must be a non-empty array of strings`);
  }
  if (!Array.isArray(proposal.evidence_refs) || !proposal.evidence_refs.length) {
    errors.push(`${cid}: evidence_refs must be a non-empty array`);
  } else {
    for (const ref of proposal.evidence_refs) {
      if (!sourceIds.has(ref)) errors.push(`${cid}: unknown evidence source ${ref}`);
    }
  }
  judged.add(cid);
}

const applicableJudgment = rubric.items
  .filter((item) => item.evaluation === "model_judgment")
  .filter((item) => audit.checks?.[item.id]?.applicable !== false);
if (!process.argv.includes("--allow-partial")) {
  for (const item of applicableJudgment) {
    if (!judged.has(item.id)) errors.push(`${item.id}: applicable judgment check is missing from the proposal`);
  }
}
if (errors.length) {
  for (const error of errors) console.error(`error: ${error}`);
  console.error(`\n${errors.length} judgment error(s); no audit written.`);
  process.exit(1);
}

for (const [cid, proposal] of Object.entries(judgment.checks)) {
  audit.checks[cid] = {
    applicable: true,
    score: proposal.score,
    confidence: proposal.confidence,
    evidence: proposal.evidence,
    evidence_refs: proposal.evidence_refs,
    needs_review: false,
    review: {
      method: "model_judgment",
      reviewer: judgment.model.name,
      reviewed_at: judgment.model.reviewed_at || new Date().toISOString(),
    },
  };
  if (proposal.notes) audit.checks[cid].notes = proposal.notes;
}
if (audit.review) audit.review.status = "complete";

const out = path.resolve(outPath);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(audit, null, 2) + "\n", "utf8");
console.log(`merged ${judged.size} judgment check(s) from ${judgment.model.name}`);
console.log(`wrote ${out}`);
