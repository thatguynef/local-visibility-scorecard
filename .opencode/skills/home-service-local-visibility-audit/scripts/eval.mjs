#!/usr/bin/env node
/**
 * Judgment-layer evaluation harness.
 *
 * This script does not call a model. It scores pre-collected responses from one
 * or more reviewers against a filled, synthetic audit. That keeps CI offline and
 * makes disagreement observable without turning the score into prose.
 *
 *   node eval.mjs --snapshot examples/acme-plumbing --responses evals/run.json --out evals/run-result.json
 *   node eval.mjs --snapshot examples/acme-plumbing --mock
 */

import fs from "node:fs";
import path from "node:path";

const HELP = `Local Visibility Scorecard eval harness 1.0.0

Usage:
  node eval.mjs --snapshot <run-dir> [options]

Required:
  --snapshot <dir>       Directory containing audit.filled.json

One of:
  --responses <json>     Pre-collected model/reviewer responses
  --mock                 Deterministic dry run; no model call

Optional:
  --out <json>           Output result (default: evals/<date>/result.json)
  --models <names>       Comma-separated expected model names for --responses
  --help

Response shape:
  {
    "models": [
      { "name": "model-a",
        "checks": {
          "LV-AI-04": { "score": 2, "confidence": "verified", "evidence_refs": ["google-ai-mode"] }
        }
      }
    ]
  }

Only judgment checks are sampled. Owner-data questions are never evaluated.
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
const has = (name) => process.argv.includes(`--${name}`);
const snapshot = arg("snapshot");
if (!snapshot || snapshot === true) {
  console.error("error: --snapshot is required");
  process.exit(2);
}
if (!has("responses") && !has("mock")) {
  console.error("error: provide --responses <json> or --mock");
  process.exit(2);
}
const snapshotDir = path.resolve(snapshot);
const filledPath = path.join(snapshotDir, "audit.filled.json");
const rubricPath = path.join(import.meta.dirname, "..", "references", "rubric.json");
const date = new Date().toISOString().slice(0, 10);
const outPath = path.resolve(arg("out", path.join("evals", date, "result.json")));

const rubric = JSON.parse(fs.readFileSync(rubricPath, "utf8"));
const filled = JSON.parse(fs.readFileSync(filledPath, "utf8"));
const items = rubric.items.filter((item) => item.evaluation === "model_judgment");
const ids = items.map((item) => item.id);
const checks = filled.checks || {};

function baselineResponses(name) {
  const result = { name, checks: {} };
  for (const item of items) {
    const check = checks[item.id];
    if (!check || !check.applicable) continue;
    result.checks[item.id] = {
      score: check.score,
      confidence: check.confidence,
      evidence_refs: check.evidence_refs || [],
    };
  }
  return result;
}

function mockResponses() {
  const a = baselineResponses("mock-baseline");
  const b = baselineResponses("mock-disagreement");
  const first = ids.find((id) => checks[id]?.applicable);
  if (first && b.checks[first]) {
    b.checks[first].score = Math.max(0, b.checks[first].score - 1);
    b.checks[first].confidence = "strong_signal";
  }
  return { models: [a, b] };
}

let responses;
if (has("mock")) {
  responses = mockResponses();
} else {
  const responsePath = arg("responses");
  if (responsePath === true) {
    console.error("error: --responses requires a path");
    process.exit(2);
  }
  responses = JSON.parse(fs.readFileSync(path.resolve(responsePath), "utf8"));
}
if (!Array.isArray(responses.models) || responses.models.length < 1) {
  console.error("error: responses.models must be a non-empty array");
  process.exit(2);
}

const sourceIds = new Set((filled.sources || []).map((source) => source.id));
const perModel = [];
const scoreMatrix = Object.fromEntries(ids.map((id) => [id, []]));
let severityDisagreements = 0;
let evidenceCitations = 0;
let evidenceMisses = 0;
let unsupportedClaims = 0;
let hallucinatedIds = 0;
let compared = 0;

for (const model of responses.models) {
  const name = model.name || "anonymous";
  let agreement = 0;
  let comparable = 0;
  for (const [id, response] of Object.entries(model.checks || {})) {
    if (!ids.includes(id)) {
      hallucinatedIds += 1;
      continue;
    }
    const baseline = checks[id];
    if (!baseline || !baseline.applicable) continue;
    comparable += 1;
    if (response.score === baseline.score) agreement += 1;
    scoreMatrix[id].push(response.score);
    if (response.confidence !== baseline.confidence) severityDisagreements += 1;
    const refs = Array.isArray(response.evidence_refs) ? response.evidence_refs : [];
    if (refs.length && refs.every((ref) => sourceIds.has(ref))) evidenceCitations += 1;
    else evidenceMisses += 1;
    if (response.service_terms?.length && !Array.isArray(response.evidence_refs)) unsupportedClaims += 1;
  }
  compared += comparable;
  perModel.push({
    name,
    sampled: comparable,
    agreement_rate: comparable ? Math.round((100 * agreement) / comparable) : null,
    disagreement: comparable - agreement,
  });
}

const stability = Object.fromEntries(
  Object.entries(scoreMatrix).map(([id, values]) => [id, values.length ? Math.max(...values) - Math.min(...values) : null]),
);
const unstable = Object.entries(stability).filter(([, spread]) => spread !== null && spread > 1);

const result = {
  schema_version: "1.0",
  generated_at: new Date().toISOString(),
  snapshot: path.relative(process.cwd(), snapshotDir).split(path.sep).join("/"),
  rubric_version: rubric.version,
  mode: has("mock") ? "mock" : "pre_collected",
  models: perModel,
  sampled_checks: ids,
  metrics: {
    reviewed_responses: compared,
    agreement_rate: perModel.length
      ? Math.round(perModel.reduce((sum, model) => sum + (model.agreement_rate || 0), 0) / perModel.length)
      : null,
    severity_disagreements: severityDisagreements,
    evidence_citation_rate: compared ? Math.round((100 * evidenceCitations) / (evidenceCitations + evidenceMisses)) : null,
    unsupported_claim_rate: compared ? Math.round((100 * unsupportedClaims) / compared) : null,
    hallucinated_check_ids: hallucinatedIds,
    unstable_checks: unstable.map(([id, spread]) => ({ id, spread })),
  },
  per_check_stability: stability,
  notes: [
    "This harness scores pre-collected responses or a deterministic mock. It makes no live model call.",
    "Only judgment-dependent checks are sampled. Deterministic facts are not re-judged.",
    "Public eval fixtures are synthetic. Never publish live client evidence.",
  ],
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n", "utf8");
console.log(JSON.stringify(result.metrics, null, 2));
console.log(`wrote ${outPath}`);
