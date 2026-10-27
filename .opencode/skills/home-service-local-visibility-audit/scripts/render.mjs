#!/usr/bin/env node
/**
 * Render a Local Visibility Scorecard one-pager or full report from
 * scores.json + content.json.
 *
 * The renderer owns the tables, IDs, scores, visibility matrix, geo-grid
 * summary, AI breakdown, and provenance. content.json owns the prose. A leaked
 * finding with no check ID, an unsupported check, a confidence mismatch, or a
 * fix that claims more points than are recoverable is rejected.
 *
 *   node render.mjs --scores scores.json --content content.json --out one-page.md
 *   node render.mjs --mode full --scores scores.json --content content.json --out full-report.md
 */

import fs from "node:fs";
import path from "node:path";

const HELP = `Local Visibility Scorecard renderer 1.0.0

Usage:
  node render.mjs --scores <json> --content <json> --out <md> [options]

Required:
  --scores <json>     scores.json from score.py
  --content <json>    Reviewer/model prose, gap IDs, fixes, and notes
  --out <md>          Output Markdown file

Optional:
  --mode one-page|full  Default: one-page
  --template <md>       Override the default template
  --help                Show this help

The renderer never invents business facts.
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
const scoresPath = arg("scores");
const contentPath = arg("content");
const outPath = arg("out");
const mode = String(arg("mode", "one-page"));
if (!scoresPath || !contentPath || !outPath) {
  console.error("error: --scores, --content, and --out are required");
  process.exit(2);
}
if (!["one-page", "full"].includes(mode)) {
  console.error("error: --mode must be one-page or full");
  process.exit(2);
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
let scores;
let content;
try {
  scores = readJson(scoresPath);
  content = readJson(contentPath);
} catch (error) {
  console.error(`error: could not read input JSON: ${error.message}`);
  process.exit(2);
}
if (scores.schema_version !== "1.0" || scores.framework !== "local-discovery") {
  console.error("error: unsupported scores schema; expected Local Visibility Scorecard 1.0");
  process.exit(2);
}
if (!scores.metrics) {
  console.error("error: scores.json is missing the metrics block");
  process.exit(2);
}

const errors = [];
const checks = new Map((scores.checks || []).map((check) => [check.id, check]));
const ownerIds = new Set((scores.ownerDataRequired || []).map((entry) => entry.id));
const opportunityIds = new Set((scores.opportunities || []).map((entry) => entry.id));
const escapeCell = (value) => String(value ?? "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
const escapeInline = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const confidenceLabel = (value) => String(value || "").replaceAll("_", " ").toUpperCase();
const fmtPct = (value) => (value === null || value === undefined ? "N/A" : `${(Number(value) * 100).toFixed(1)}%`);
const fmtNum = (value, places = 2) => (value === null || value === undefined ? "N/A" : Number(value).toFixed(places));
const stageName = (value) =>
  ({
    search: "Search",
    discover: "Discover",
    ask: "Ask",
    compare: "Compare",
    resilience: "Resilience",
    handoff: "Handoff",
    measure: "Measure",
  }[value] || String(value || "—"));
const statusLabel = (value) =>
  ({
    scored: "Scored",
    scored_plus_owner_data: "Scored + owner data",
    owner_data_required: "Owner data required",
    observed_unscored: "Observed, not scored",
    conditional: "Conditional",
    diagnostic: "Diagnostic",
    not_applicable: "Not applicable",
  }[value] || String(value || "").replaceAll("_", " "));
const signalLabel = (value) => {
  if (value === null || value === undefined) return "N/A";
  if (value >= 0.6) return "Strong";
  if (value >= 0.3) return "Partial";
  if (value > 0) return "Weak";
  return "Absent";
};

function scoreValue(check) {
  return check.applicable ? `${check.score}/${check.max}` : "N/A";
}

function validateContent() {
  if (!content.client || !content.verdict || !content.date) errors.push("content needs client, verdict, and date");
  const leaks = content.gaps || content.leaks;
  if (!Array.isArray(leaks) || leaks.length !== 3) errors.push("content.gaps must contain exactly three findings");
  for (const [index, gap] of (leaks || []).entries()) {
    const label = gap.title || `gap ${index + 1}`;
    if (!gap.title || !gap.what || !gap.evidence || !gap.why || !gap.fix) {
      errors.push(`${label}: title, what, evidence, why, and fix are required`);
    }
    if (gap.checkId && gap.ownerDataId) errors.push(`${label}: use checkId or ownerDataId, not both`);
    if (!gap.checkId && !gap.ownerDataId) errors.push(`${label}: a checkId or ownerDataId is required`);
    if (gap.checkId) {
      const check = checks.get(gap.checkId);
      if (!check) errors.push(`${label}: unknown checkId ${gap.checkId}`);
      else {
        if (!check.applicable) errors.push(`${label}: ${gap.checkId} is not applicable and cannot be a gap`);
        if (check.lost <= 0) errors.push(`${label}: ${gap.checkId} has no lost points`);
        if (gap.confidence && gap.confidence !== check.confidence) {
          errors.push(`${label}: confidence ${gap.confidence} does not match ${check.confidence}`);
        }
      }
    }
    if (gap.ownerDataId && !ownerIds.has(gap.ownerDataId)) errors.push(`${label}: unknown ownerDataId ${gap.ownerDataId}`);
    if (gap.ownerDataId && gap.confidence && gap.confidence !== "owner_data_required") {
      errors.push(`${label}: an owner-data gap must use confidence owner_data_required`);
    }
  }
  for (const [index, fix] of (content.fixes || []).entries()) {
    const label = fix.fix || `fix ${index + 1}`;
    if (!fix.fix || !Array.isArray(fix.checks) || !fix.checks.length) {
      errors.push(`${label}: fix text and check IDs are required`);
      continue;
    }
    let recoverable = 0;
    for (const cid of fix.checks) {
      const check = checks.get(cid);
      if (!check) errors.push(`${label}: unknown check ${cid}`);
      else recoverable += check.lost;
    }
    if (!Number.isInteger(fix.points) || fix.points < 0) errors.push(`${label}: points must be a non-negative integer`);
    if (fix.points > recoverable) errors.push(`${label}: claims +${fix.points} but only ${recoverable} points are recoverable`);
    if (!["S", "M", "L"].includes(fix.effort)) errors.push(`${label}: effort must be S, M, or L`);
  }
  for (const [index, opportunity] of (content.opportunities || []).entries()) {
    if (!opportunityIds.has(opportunity.id)) errors.push(`opportunity ${index + 1}: unknown id ${opportunity.id}`);
    if (!opportunity.why) errors.push(`opportunity ${index + 1}: why is required`);
  }
  for (const finding of content.findings || []) {
    if (!checks.has(finding.id)) errors.push(`finding: unknown check ${finding.id}`);
  }
  if (errors.length) {
    for (const error of errors) console.error(`error: ${error}`);
    console.error(`\n${errors.length} content error(s); no report written.`);
    process.exit(1);
  }
}
validateContent();

const gaps = content.gaps || content.leaks;

function gapBlocks() {
  return gaps
    .map((gap, index) => {
      const lines = [`### ${index + 1}. ${escapeInline(gap.title)}`, ""];
      if (gap.stage) lines.push(`**Stage:** ${escapeInline(gap.stage)}`);
      if (gap.checkId) lines.push(`**Check:** ${gap.checkId}`);
      if (gap.ownerDataId) lines.push(`**Owner data:** ${gap.ownerDataId} · **Not scored**`);
      lines.push("");
      lines.push(`**What is happening:** ${escapeInline(gap.what)}`);
      lines.push("");
      lines.push(`**Evidence:** ${escapeInline(gap.evidence)}`);
      lines.push("");
      lines.push(`**Why it matters:** ${escapeInline(gap.why)}`);
      lines.push("");
      lines.push(`**Fix:** ${escapeInline(gap.fix)}`);
      lines.push("");
      lines.push(`**Confidence:** ${confidenceLabel(gap.confidence)}`);
      return lines.join("\n");
    })
    .join("\n\n---\n\n");
}

function scoreTable(detailed = false) {
  if (detailed) {
    const lines = ["| Category | Earned | Applicable | Weight | Normalized |", "|---|---:|---:|---:|---:|"];
    for (const category of scores.categories) {
      lines.push(
        `| ${category.id}. ${category.name} | ${category.earned} | ${category.applicable_max} | ${category.max} | ${Number(category.normalized).toFixed(2)} |`,
      );
    }
    lines.push(`| **Total** | **${scores.final}** | **100** | **100** | **${Number(scores.total).toFixed(2)}** |`);
    return lines.join("\n");
  }
  const lines = ["| Area | Score |", "|---|---|"];
  for (const category of scores.categories) {
    lines.push(`| ${category.name} | ${Number(category.normalized).toFixed(1)} / ${category.max} |`);
  }
  lines.push(`| **Total** | **${scores.display} / 100** |`);
  return lines.join("\n");
}

function snapshotTable() {
  const m = scores.metrics;
  const bySurface = m.by_surface || {};
  const ai = m.ai || {};
  const competitive = m.competitive || {};
  const lines = [
    "| Surface | Observed signal | Reading |",
    "|---|---|---|",
    `| Local Pack | ${fmtPct(bySurface.google_local_pack?.top10)} top-10 | ${signalLabel(bySurface.google_local_pack?.top10)} |`,
    `| Google Maps | ${fmtPct(bySurface.google_maps?.top10)} top-10 | ${signalLabel(bySurface.google_maps?.top10)} |`,
    `| Organic search | ${fmtPct(bySurface.google_organic?.top10)} top-10 | ${signalLabel(bySurface.google_organic?.top10)} |`,
    `| AI answers | ${fmtPct(ai.mention_coverage)} mentioned | ${signalLabel(ai.mention_coverage)} |`,
    `| Business-competitor Top-10 share | ${fmtPct(competitive.top10_share)} | ${signalLabel(competitive.top10_share)} |`,
  ];
  return lines.join("\n");
}

function visibilityMatrix() {
  const rows = scores.visibilityMatrix || scores.metrics.visibility_matrix || [];
  const lines = [
    "| Service | Maps | Organic | AI | Opportunity |",
    "|---|---|---|---|---|",
  ];
  for (const row of rows) {
    lines.push(`| ${escapeCell(row.service)} | ${row.maps} | ${row.organic} | ${row.ai} | ${row.opportunity} |`);
  }
  return lines.join("\n");
}

function geoTable() {
  const m = scores.metrics;
  const bySurface = m.by_surface || {};
  const geo = m.geo || {};
  let lines = ["| Surface | Top-3 | Top-10 | Top-20 | Avg visible position |", "|---|---:|---:|---:|---:|"];
  for (const [key, label] of [
    ["google_local_pack", "Local Pack"],
    ["google_maps", "Google Maps"],
    ["google_organic", "Organic"],
  ]) {
    const row = bySurface[key];
    if (!row) continue;
    lines.push(
      `| ${label} | ${fmtPct(row.top3)} | ${fmtPct(row.top10)} | ${fmtPct(row.top20)} | ${fmtNum(row.avg_visible_position, 1)} |`,
    );
  }
  lines = lines.concat([
    "",
    `**Geo-grid coverage:** ${fmtPct(geo.geo_grid_coverage)} of observed grid points have a top-10 Maps result for at least one core intent. **Weakest quadrant:** ${fmtPct(geo.weakest_quadrant)}.`,
    "",
    "| Quadrant | Top-10 coverage |",
    "|---|---:|",
  ]);
  for (const quadrant of ["NE", "NW", "SE", "SW"]) {
    lines.push(`| ${quadrant} | ${fmtPct(geo.quadrant_coverage?.[quadrant])} |`);
  }
  return lines.join("\n");
}

function aiTable() {
  const ai = scores.metrics.ai || {};
  let lines = [
    "| AI surface | Source type | Pairs | Mention | Recommend | Cite |",
    "|---|---|---:|---:|---:|---:|",
  ];
  for (const surface of ai.by_surface || []) {
    lines.push(
      `| ${escapeCell(surface.product_surface)} | ${surface.source_type} | ${surface.pairs} | ${fmtPct(surface.mention)} | ${fmtPct(surface.recommendation)} | ${fmtPct(surface.citation)} |`,
    );
  }
  lines.push(
    `| **All validated surfaces** | mixed | ${ai.pairs ?? 0} | ${fmtPct(ai.mention_coverage)} | ${fmtPct(ai.recommendation_coverage)} | ${fmtPct(ai.citation_coverage)} |`,
  );
  lines = lines.concat([
    "",
    `**Prompt-intent coverage:** ${fmtPct(ai.prompt_intent_coverage)} · **Repeat stability:** ${fmtPct(ai.repeat_stability)} · **Surface breadth:** ${fmtPct(ai.surface_breadth)}.`,
    "",
    "Consumer/search surfaces and model/API surfaces are shown separately and are never pooled into one rank.",
  ]);
  return lines.join("\n");
}

function journeyTable() {
  const supplied = new Map((content.journey || []).map((row) => [String(row.stage || "").toLowerCase(), row]));
  const lines = ["| Stage | Status | What was observed |", "|---|---|---|"];
  for (const stage of scores.journey || []) {
    const custom = supplied.get(stage.label.toLowerCase()) || {};
    const status = custom.status || stage.status;
    const summary = custom.summary || (stage.percent !== null ? `${stage.percent}% of applicable points` : "Not scored from public data");
    lines.push(`| ${stage.label} | ${statusLabel(status)} | ${escapeCell(summary)} |`);
  }
  return lines.join("\n");
}

function strengths() {
  if (Array.isArray(content.strengths) && content.strengths.length) {
    return content.strengths.map((entry) => `- ${escapeInline(entry)}`).join("\n");
  }
  const strong = (scores.categories || []).filter((category) => category.percent !== null && category.percent >= 75);
  return strong.length
    ? strong.map((category) => `- ${category.name}: ${category.normalized.toFixed(1)} / ${category.max}`).join("\n")
    : "- No category reached 75% of its applicable points.";
}

function fixesTable() {
  const lines = ["| # | Fix | Checks | Points | Effort |", "|---|---|---|---|---|"];
  (content.fixes || []).forEach((fix, index) => {
    lines.push(`| ${index + 1} | ${escapeCell(fix.fix)} | ${(fix.checks || []).join(", ")} | +${fix.points} | ${fix.effort} |`);
  });
  return lines.join("\n");
}

function ownerData(limit = null) {
  const supplied = new Map((content.ownerData || []).map((entry) => [entry.id, entry]));
  let entries = (scores.ownerDataRequired || []).map((entry) => ({ ...entry, ...(supplied.get(entry.id) || {}) }));
  if (limit) entries = entries.slice(0, limit);
  if (!entries.length) return "_No owner-data opportunities supplied._";
  return (
    "**OWNER DATA REQUIRED — not scored.**\n\n" +
    entries
      .map((entry) => {
        const questions = (entry.questions || []).map((question) => `  - ${question}`).join("\n");
        const head = `**${entry.title}**${entry.stage ? ` (${entry.stage})` : ""} — ${entry.why || entry.whyItMatters || ""}`;
        return questions ? `${head}\n${questions}` : head;
      })
      .join("\n\n")
  );
}

function capNote() {
  const active = (scores.caps || []).filter((cap) => cap.active);
  if (!active.length) return "";
  const binding = active.filter((cap) => cap.binding);
  if (!binding.length) return `**Hard cap trigger observed:** ${active.map((cap) => cap.label).join("; ")}. The cap is active but not binding.`;
  const overall = binding.filter((cap) => cap.scope === "overall");
  if (overall.length) {
    return `**Hard cap:** ${overall.map((cap) => cap.label).join("; ")}. Score capped at ${scores.cap} / 100.`;
  }
  const categories = binding.map((cap) => `${cap.label} (category ${cap.category} capped at ${cap.max})`).join("; ");
  return `**Category cap:** ${categories}. Effective score: ${scores.display} / 100.`;
}

function capsTable() {
  const active = (scores.caps || []).filter((cap) => cap.active);
  if (!active.length) return "_No hard cap is active._";
  const lines = ["| Cap | Scope | Max | Binding | Why |", "|---|---|---:|---|---|"];
  for (const cap of active) {
    lines.push(
      `| ${cap.label} | ${cap.scope === "overall" ? "Overall" : `Category ${cap.category}`} | ${cap.max} | ${cap.binding ? "Yes" : "No"} | ${escapeCell(cap.rationale)} |`,
    );
  }
  return lines.join("\n");
}

function findingsTable() {
  const supplied = new Map((content.findings || []).map((entry) => [entry.id, entry]));
  const lines = ["| ID | Stage | Score | Confidence | What was observed | Fix |", "|---|---|---|---|---|---|"];
  for (const check of scores.checks || []) {
    const finding = supplied.get(check.id) || {};
    const observed = check.applicable
      ? finding.observed || (check.evidence || []).join("; ")
      : `N/A: ${check.na_reason || "not applicable"}`;
    const fix = check.applicable
      ? finding.fix || (check.score === check.max ? "—" : check.recommendedIntervention) || "—"
      : "—";
    lines.push(
      `| ${check.id} | ${stageName(check.stage)} | ${scoreValue(check)} | ${check.applicable ? confidenceLabel(check.confidence) : "NOT APPLICABLE"} | ${escapeCell(observed)} | ${escapeCell(fix)} |`,
    );
  }
  return lines.join("\n");
}

function opportunityBlocks() {
  const entries = content.opportunities || [];
  if (!entries.length) return "_No optional opportunities selected._";
  return entries
    .map(
      (entry) =>
        `- **${escapeInline(entry.label)}** (\`${entry.radModule}\`) — ${escapeInline(entry.why)}\n\n  Not scored. An optional service is never the reason a business loses points.`,
    )
    .join("\n");
}

function provenance() {
  const sources = (scores.sources || [])
    .map(
      (source) =>
        `| ${source.id} | ${source.provider} | ${source.type} | ${source.surface} | ${source.method} | ${source.field_completeness}% | ${source.collected_at} |`,
    )
    .join("\n");
  return [
    "| Source | Provider | Type | Surface | Method | Field completeness | Collected |",
    "|---|---|---|---|---|---:|---|",
    sources,
    "",
    `**Audit mode:** ${scores.audit_mode} · **Rubric:** v${scores.rubric_version} · **Collector:** v${scores.meta.collector_version} · **Scorer:** v${scores.scorer_version}`,
    "",
    `**Query universe:** \`${scores.query_universe_hash}\``,
    "",
    "Public Mode observes only public data. DataForSEO is an implementation provider, not the methodology. The collector does not call, text, book, submit a form, or change a profile. Owner-data questions are reported separately and never reduce the public score.",
  ].join("\n");
}

function limitations(limit = null) {
  let entries = Array.isArray(content.limitations) ? content.limitations : [];
  if (limit) entries = entries.slice(0, limit);
  return entries.length ? entries.map((entry) => `- ${escapeInline(entry)}`).join("\n") : "- Public data cannot prove revenue outcomes.";
}

const defaultTemplate = path.join(
  import.meta.dirname,
  "..",
  "references",
  mode === "full" ? "report-template.md" : "one-page-template.md",
);
const templatePath = arg("template", defaultTemplate);
let template;
try {
  template = fs.readFileSync(templatePath, "utf8");
} catch (error) {
  console.error(`error: could not read template: ${error.message}`);
  process.exit(2);
}

const replacements = {
  CLIENT: content.client,
  SYNTHETIC_LABEL: scores.meta.synthetic ? "> **Synthetic example — not a real business.**" : "",
  URL: content.url || scores.meta.domain || "",
  TRADE: content.trade || scores.meta.trade,
  MARKET: content.market || scores.meta.market,
  DATE: content.date,
  SCORE: String(scores.display),
  BAND: `${scores.band} (${scores.band_label})`,
  CAP_NOTE: capNote(),
  CAPS_TABLE: capsTable(),
  VERDICT: content.verdict,
  GAPS: gapBlocks(),
  LEAKS: gapBlocks(),
  SNAPSHOT_TABLE: snapshotTable(),
  VISIBILITY_MATRIX: visibilityMatrix(),
  GEO_TABLE: geoTable(),
  AI_TABLE: aiTable(),
  JOURNEY_TABLE: journeyTable(),
  SCORE_TABLE: scoreTable(mode === "full"),
  STRENGTHS: strengths(),
  FIXES_TABLE: fixesTable(),
  FIX_NOTE: content.fixNote || "",
  OWNER_DATA: ownerData(mode === "one-page" ? 2 : null),
  NEXT_STEPS: (content.nextSteps || []).map((step, index) => `${index + 1}. ${step}`).join("\n") || "_No next steps supplied._",
  LIMITATIONS: limitations(mode === "one-page" ? 3 : null),
  FULL_REPORT_LINK: "full-report.md",
  RUBRIC_VERSION: scores.rubric_version,
  VERSIONS: `Collector v${scores.meta.collector_version} · Scorer v${scores.scorer_version}`,
  UNIVERSE_HASH: scores.query_universe_hash,
  RUN_ID: scores.meta.run_id,
  FOOTER: content.footer || "Synthetic example for documentation. Not a real business.",
  EXECUTIVE_SUMMARY: (content.executiveSummary || []).map((entry) => `- ${escapeInline(entry)}`).join("\n") || "- See findings.",
  FINDINGS_TABLE: findingsTable(),
  OPPORTUNITIES: opportunityBlocks(),
  PROVENANCE: provenance(),
};

let output = template;
for (const [key, value] of Object.entries(replacements)) {
  output = output.replaceAll(`{{${key}}}`, String(value));
}
output = output.replace(/\n{3,}/g, "\n\n");
if (/\{\{[A-Z0-9_]+\}\}/.test(output)) {
  const missing = [...output.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)].map((match) => match[1]);
  console.error(`error: unfilled template placeholder(s): ${[...new Set(missing)].join(", ")}`);
  process.exit(1);
}

const out = path.resolve(outPath);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, output.endsWith("\n") ? output : `${output}\n`, "utf8");
console.log(`wrote ${out}`);
