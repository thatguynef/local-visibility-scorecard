#!/usr/bin/env node
/**
 * Verify one Local Visibility Scorecard run.
 *
 *   node verify.mjs --run examples/acme-plumbing \
 *     --filled examples/acme-plumbing/audit.filled.json \
 *     --scores examples/acme-plumbing/scores.json \
 *     --content examples/acme-plumbing/content.json \
 *     --report examples/acme-plumbing/full-report.md \
 *     --one-page examples/acme-plumbing/one-page.md \
 *     --out examples/acme-plumbing/verification.json \
 *     --mutation --fixture --synthetic
 *
 * Exit 0 = pass, 1 = hard failure, 2 = bad input.
 * The verifier is file-based. It never contacts the business or re-runs the collector.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { hashUniverse } from "./lib/universe.mjs";
import { computeMetrics, deriveAudit, evaluateValidity } from "./lib/metrics.mjs";

const HELP = `Local Visibility Scorecard verifier 1.0.0

Usage:
  node verify.mjs --run <dir> [options]

Required:
  --run <dir>              Report/run directory

Recommended:
  --filled <json>          Default: <run>/audit.filled.json
  --scores <json>          Default: <run>/scores.json
  --content <json>         Default: <run>/content.json
  --report <md>            Default: <run>/full-report.md
  --one-page <md>          Default: <run>/one-page.md
  --out <json>             Default: <run>/verification.json
  --mutation               Run the verifier mutation suite
  --fixture                Re-score the golden fixture and compare with --scores
  --synthetic              Require synthetic labels

Optional:
  --rubric <json>          Default: references/rubric.json
  --help                   Show this help

Exit codes: 0 pass, 1 hard failure, 2 bad input.
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
const RUN = arg("run");
if (!RUN) {
  console.error("error: --run is required\n");
  console.error(HELP);
  process.exit(2);
}
const runDir = path.resolve(RUN);
const filledPath = path.resolve(arg("filled", path.join(runDir, "audit.filled.json")));
const scoresPath = path.resolve(arg("scores", path.join(runDir, "scores.json")));
const contentPath = path.resolve(arg("content", path.join(runDir, "content.json")));
const reportPath = path.resolve(arg("report", path.join(runDir, "full-report.md")));
const onePagePath = path.resolve(arg("one-page", path.join(runDir, "one-page.md")));
const outPath = path.resolve(arg("out", path.join(runDir, "verification.json")));
const rubricPath = path.resolve(arg("rubric", path.join(import.meta.dirname, "..", "references", "rubric.json")));
const syntheticRequired = has("synthetic");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const readText = (file) => fs.readFileSync(file, "utf8");
const exists = (file) => fs.existsSync(file);
const localDate = (now = new Date()) =>
  new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const roundTo = (value, places) => {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};
const priority = { critical: 0, high: 1, medium: 2, low: 3 };

function load() {
  return {
    rubric: readJson(rubricPath),
    filled: readJson(filledPath),
    scores: readJson(scoresPath),
    content: exists(contentPath) ? readJson(contentPath) : null,
    report: exists(reportPath) ? readText(reportPath) : "",
    onePage: exists(onePagePath) ? readText(onePagePath) : "",
    run: exists(path.join(runDir, "run.json")) ? readJson(path.join(runDir, "run.json")) : null,
    queryUniverseFile: exists(path.join(runDir, "query-universe.json"))
      ? readJson(path.join(runDir, "query-universe.json"))
      : null,
  };
}

function configOf(filled) {
  return { ...(filled.configuration || {}) };
}

function requirementMet(requirement, filled) {
  const coreIntents = new Set(
    (filled.query_universe?.queries || [])
      .filter((query) => query.role === "core" && query.brand === "non_brand")
      .map((query) => query.intent_id),
  );
  if (requirement === "organic_target_observations") {
    return (filled.organic?.observations || []).some(
      (observation) =>
        !observation.not_collected &&
        observation.target_found === true &&
        coreIntents.has(observation.intent_id),
    );
  }
  if (requirement === "ai_target_observations") {
    return (filled.ai?.observations || []).some(
      (observation) => !observation.not_collected && observation.target_mentioned === true,
    );
  }
  if (requirement === "listing_observations") {
    return (filled.authority?.listings || []).length > 0;
  }
  return true;
}

function isApplicable(item, filled) {
  const config = configOf(filled);
  if (item.applicability === "conditional" && !config[item.condition]) {
    return { applicable: false, reason: `condition not enabled: ${item.condition}` };
  }
  if (item.requires && !requirementMet(item.requires, filled)) {
    return { applicable: false, reason: `not observable: ${item.requires}` };
  }
  return { applicable: true, reason: "" };
}

function capClause(clause, facts) {
  const value = facts?.[clause.fact];
  if ("equals" in clause) return value === clause.equals;
  if ("in" in clause) return clause.in.includes(value);
  return false;
}
function capTriggered(cap, facts) {
  return cap.trigger.all.every((clause) => capClause(clause, facts));
}
function bandFor(display, rubric) {
  return [...rubric.bands].sort((a, b) => b.min - a.min).find((entry) => display >= entry.min);
}

function computeScores(filled, rubric) {
  const config = configOf(filled);
  const facts = filled.facts || {};
  const checks = filled.checks || {};
  const activeCaps = rubric.caps.filter((cap) => capTriggered(cap, facts));
  const categoryCaps = {};
  for (const cap of activeCaps.filter((entry) => entry.scope === "category")) {
    categoryCaps[cap.category] = categoryCaps[cap.category] || [];
    categoryCaps[cap.category].push(cap);
  }
  const categories = [];
  for (const category of rubric.categories) {
    let applicableMax = 0;
    let earned = 0;
    for (const item of rubric.items.filter((entry) => entry.cat === category.id)) {
      const applies = isApplicable(item, filled).applicable;
      if (!applies) continue;
      applicableMax += item.max;
      earned += checks[item.id]?.score || 0;
    }
    const normalizedBefore = applicableMax ? roundTo((category.max * earned) / applicableMax, 2) : 0;
    const categoryCap = categoryCaps[category.id]?.length
      ? Math.min(...categoryCaps[category.id].map((entry) => entry.max))
      : null;
    categories.push({
      id: category.id,
      name: category.name,
      max: category.max,
      earned,
      applicableMax,
      normalizedBefore,
      normalized: categoryCap === null ? normalizedBefore : roundTo(Math.min(normalizedBefore, categoryCap), 2),
      categoryCap,
    });
  }
  const applicableWeight = categories.filter((category) => category.applicableMax > 0).reduce((sum, category) => sum + category.max, 0);
  const rawTotal = roundTo(categories.reduce((sum, category) => sum + category.normalized, 0), 2);
  const total = applicableWeight ? roundTo((rawTotal * 100) / applicableWeight, 1) : 0;
  const overallCaps = activeCaps.filter((cap) => cap.scope === "overall");
  const cap = overallCaps.length ? Math.min(...overallCaps.map((entry) => entry.max)) : 100;
  const final = roundTo(Math.min(total, cap), 1);
  const display = Math.round(final);
  return {
    config,
    facts,
    checks,
    activeCaps,
    categories,
    applicableWeight,
    rawTotal,
    total,
    cap,
    final,
    display,
    band: bandFor(display, rubric),
    categoryCaps,
  };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const deepEqual = (a, b) => same(a, b);

function makeChecker(data) {
  const hard = [];
  const soft = [];
  const checks = {};
  const addHard = (id, message) => {
    hard.push({ id, message });
    checks[id] = false;
  };
  const addSoft = (id, message) => {
    soft.push({ id, message });
    checks[id] = checks[id] !== false;
  };
  const pass = (id) => {
    if (checks[id] === undefined) checks[id] = true;
  };

  const { rubric, filled, scores, content, report, onePage, run, queryUniverseFile } = data;
  const items = rubric.items;
  const byId = Object.fromEntries(items.map((item) => [item.id, item]));
  const math = computeScores(filled, rubric);
  const filledChecks = filled.checks || {};
  const sourceIds = new Set((filled.sources || []).map((source) => source.id));

  // I1 exact IDs
  const expected = items.map((item) => item.id).sort();
  const actual = Object.keys(filledChecks).sort();
  same(expected, actual)
    ? pass("I1")
    : addHard("I1", `check IDs differ; missing=${expected.filter((id) => !actual.includes(id)).join(",")} extra=${actual.filter((id) => !expected.includes(id)).join(",")}`);

  // I2 weights and version
  rubric.categories.reduce((sum, category) => sum + category.max, 0) === 100
    ? pass("I2")
    : addHard("I2", "category maxima do not sum to 100");
  filled.run?.rubric_version === rubric.version && scores.rubric_version === rubric.version && filled.run?.collector_version === scores.meta?.collector_version
    ? pass("I3")
    : addHard("I3", "rubric or collector version mismatch");

  // I4-I7 applicability, score, evidence, confidence
  let applicableOk = true;
  let scoreOk = true;
  let evidenceOk = true;
  for (const item of items) {
    const check = filledChecks[item.id];
    if (!check) {
      applicableOk = false;
      continue;
    }
    const expectedApplicability = isApplicable(item, filled);
    if (check.applicable !== expectedApplicability.applicable) applicableOk = false;
    if (!expectedApplicability.applicable) {
      if (check.score !== null || check.confidence !== "not_applicable") applicableOk = false;
      if (!check.na_reason && !expectedApplicability.reason) applicableOk = false;
      continue;
    }
    if (check.needs_review === true || !Number.isInteger(check.score) || !item.allowed.includes(check.score)) scoreOk = false;
    if (!Array.isArray(check.evidence) || !check.evidence.length) evidenceOk = false;
    if (!Array.isArray(check.evidence_refs) || !check.evidence_refs.length) evidenceOk = false;
    for (const ref of check.evidence_refs || []) if (!sourceIds.has(ref)) evidenceOk = false;
    if (!["verified", "strong_signal"].includes(check.confidence)) evidenceOk = false;
    if (item.evaluation === "deterministic" && check.confidence !== "verified") evidenceOk = false;
  }
  applicableOk ? pass("I4") : addHard("I4", "applicability conflicts with configuration or structural N/A rules");
  scoreOk ? pass("I5") : addHard("I5", "a score is outside its allowed set, null, or still needs review");
  evidenceOk ? pass("I6") : addHard("I6", "missing evidence, invalid confidence, or an unknown evidence source");

  // I7 facts restate structured observations and metrics
  const recomputedValidity = evaluateValidity(filled);
  const recomputedMetrics = computeMetrics(filled);
  const derived = deriveAudit(filled, rubric);
  const facts = math.facts;
  const factChecks = [
    [facts.target_resolved, filled.business?.resolution?.resolved, "target_resolved"],
    [facts.query_universe_locked, filled.query_universe?.locked, "query_universe_locked"],
    [facts.non_branded_discovery_present, recomputedMetrics.coverage.non_branded_discovery_present, "non_branded_discovery_present"],
    [facts.maps_observations_present, Boolean(filled.maps?.observations?.length), "maps_observations_present"],
    [facts.organic_observations_present, Boolean(filled.organic?.observations?.length), "organic_observations_present"],
    [facts.ai_observations_present, Boolean(filled.ai?.observations?.length), "ai_observations_present"],
    [facts.ai_surfaces_validated, (filled.ai?.surfaces || []).some((surface) => surface.validated && surface.available), "ai_surfaces_validated"],
    [facts.competitor_cohort_locked, filled.competitors?.locked, "competitor_cohort_locked"],
    [facts.sufficient_valid_evidence, recomputedValidity.passed, "sufficient_valid_evidence"],
  ];
  factChecks.every(([a, b]) => a === b) ? pass("I7") : addHard("I7", "a fact conflicts with the structured observation or validity gate");

  // I8-I13 scorer math
  let mathOk = true;
  for (const category of math.categories) {
    const found = (scores.categories || []).find((entry) => entry.id === category.id);
    if (!found) {
      mathOk = false;
      continue;
    }
    if (found.earned !== category.earned) mathOk = false;
    if (found.applicable_max !== category.applicableMax) mathOk = false;
    if (Math.abs(Number(found.normalized) - category.normalized) > 0.011) mathOk = false;
    if (found.max !== category.max) mathOk = false;
  }
  if (Math.abs(Number(scores.total) - math.total) > 0.11) mathOk = false;
  if (Math.abs(Number(scores.final) - math.final) > 0.11) mathOk = false;
  if (Number(scores.cap) !== math.cap) mathOk = false;
  if (Number(scores.display) !== math.display) mathOk = false;
  if (scores.band !== math.band.band) mathOk = false;
  if (Boolean(scores.cap_active) !== (math.activeCaps.length > 0)) mathOk = false;
  if (Boolean(scores.cap_binding) !== (math.final < math.total)) mathOk = false;
  const activeIds = math.activeCaps.map((cap) => cap.id).sort();
  const providedActive = (scores.caps || []).filter((cap) => cap.active).map((cap) => cap.id).sort();
  if (!same(activeIds, providedActive)) mathOk = false;
  mathOk ? pass("I8-I13") : addHard("I8-I13", `score math mismatch; expected total=${math.total} final=${math.final} display=${math.display} cap=${math.cap} band=${math.band.band}`);

  // I14 owner data excluded
  const ownerIds = new Set((scores.ownerDataRequired || []).map((entry) => entry.id));
  const scoredOwner = (scores.checks || []).filter((entry) => String(entry.id).startsWith("OD-"));
  const ownerMarked = (scores.ownerDataRequired || []).every((entry) => entry.publicScoreImpact === "none");
  !scoredOwner.length && ownerIds.size === rubric.ownerData.length && ownerMarked
    ? pass("I14")
    : addHard("I14", "owner-data questions are missing or appear inside the public score");

  // I15 conditional N/A
  let naOk = true;
  for (const item of items) {
    if (item.applicability !== "conditional") continue;
    const expectedNa = !math.config[item.condition];
    const check = filledChecks[item.id];
    if (expectedNa && (check?.applicable !== false || check?.score !== null)) naOk = false;
    if (!expectedNa && check?.applicable !== true) naOk = false;
  }
  naOk ? pass("I15") : addHard("I15", "conditional/N/A handling does not match configuration");

  // I16 source provenance, including the collection method and surface names
  const filledSources = JSON.stringify((filled.sources || []).map((source) => source.id).sort());
  const scoredSources = JSON.stringify((scores.sources || []).map((source) => source.id).sort());
  const allowedMethods = new Set(["fixture", "live", "derived"]);
  const allowedLocationMethods = new Set(["coordinate", "location_code", "not_applicable"]);
  const allowedFamilies = new Set(["serp", "ai_optimization", "dataforseo_labs", "backlinks", "business_data", "local"]);
  const allowedSurfaces = new Set([
    "query_universe",
    "google_local_pack",
    "google_maps",
    "google_local_finder",
    "google_organic",
    "google_ai_mode",
    "google_keyword_data",
    "chatgpt",
    "backlinks",
    "business_listings",
  ]);
  const sourceRows = filled.sources || [];
  const sourceShapeOk = sourceRows.every(
    (source) =>
      source.provider &&
      source.type &&
      allowedMethods.has(source.method) &&
      allowedLocationMethods.has(source.location_method) &&
      allowedFamilies.has(source.endpoint_family) &&
      allowedSurfaces.has(source.surface) &&
      Number(source.field_completeness) >= 0,
  );
  const sourceModeOk =
    filled.run?.source_mode === "fixture"
      ? sourceRows.every((source) => source.method === "fixture")
      : sourceRows.every((source) => source.method === "live" || source.method === "derived");
  filledSources === scoredSources && sourceShapeOk && sourceModeOk && (scores.sources || []).every((source) => source.provider)
    ? pass("I16")
    : addHard("I16", "source provenance is missing, invalid, or differs between audit and scores");

  // I17 cross-artifact score and total row
  const scoreTitle = new RegExp(`^#\\s+${math.display}\\s*\\/\\s*100`, "m");
  onePage && scoreTitle.test(onePage) ? pass("I17") : addHard("I17", "one-pager title score does not match scores.display");
  onePage.includes(`| **Total** | **${math.display} / 100** |`) ? pass("I18") : addHard("I18", "one-pager total row does not match scores.display");

  // I19 category rows
  let categoryRows = true;
  for (const category of math.categories) {
    if (!onePage.includes(`| ${category.name} | ${category.normalized.toFixed(1)} / ${category.max} |`)) categoryRows = false;
    if (report && !report.includes(`| ${category.id}. ${category.name} |`)) categoryRows = false;
  }
  categoryRows ? pass("I19") : addHard("I19", "category rows do not match scores.json");

  // I20 full report findings rows
  const rows = [...report.matchAll(/^\| (LV-(?:INT|MAP|ORG|AI|CMP|AUT|RES)-\d{2}) \|/gm)].map((match) => match[1]);
  const uniqueRows = new Set(rows);
  rows.length === items.length && uniqueRows.size === items.length
    ? pass("I20")
    : addHard("I20", `report finding rows=${rows.length}, unique=${uniqueRows.size}, expected=${items.length}`);

  // I21 synthetic labels
  if (scores.meta?.synthetic || syntheticRequired) {
    /synthetic/i.test(onePage) && /synthetic/i.test(report) ? pass("I21") : addHard("I21", "synthetic label is missing from a report");
  } else pass("I21");

  // I22 required sections
  const onePageSections = [
    "The three biggest visibility gaps",
    "Visibility snapshot",
    "Signature visibility matrix",
    "Score breakdown",
    "Revenue Opportunities to Investigate",
    "Limitations",
    "What to do next",
  ];
  const reportSections = [
    "Visibility snapshot",
    "Signature visibility matrix",
    "Geo-grid findings",
    "AI visibility",
    "Findings",
    "Category breakdown",
    "Opportunity Flags",
    "Limitations",
    "Method and provenance",
  ];
  onePageSections.every((section) => onePage.includes(section)) && reportSections.every((section) => report.includes(section))
    ? pass("I22")
    : addHard("I22", "a required report section is missing");

  // I23 placeholders
  !/\{\{[A-Z0-9_]+\}\}/.test(onePage) && !/\{\{[A-Z0-9_]+\}\}/.test(report)
    ? pass("I23")
    : addHard("I23", "an unfilled template placeholder remains");

  // I24 word count and report length
  const words = onePage.split(/\s+/).filter(Boolean).length;
  if (words >= 550 && words <= 1200) pass("I24");
  else addHard("I24", `one-pager word count ${words} outside 550-1200`);
  report.split(/\s+/).filter(Boolean).length > words ? pass("I25") : addHard("I25", "full report is not longer than the one-pager");

  // I26 content linkage
  const gaps = content?.gaps || content?.leaks;
  if (!content) {
    addHard("I26", "content.json is required for top-gap linkage");
  } else {
    let contentOk = true;
    if (!Array.isArray(gaps) || gaps.length !== 3) contentOk = false;
    for (const gap of gaps || []) {
      if (gap.checkId) {
        const check = filledChecks[gap.checkId];
        if (!check || check.applicable !== true || check.score >= byId[gap.checkId].max) contentOk = false;
        if (check && gap.confidence && gap.confidence !== check.confidence) contentOk = false;
      } else if (gap.ownerDataId) {
        if (!ownerIds.has(gap.ownerDataId) || gap.confidence !== "owner_data_required") contentOk = false;
      } else contentOk = false;
    }
    for (const fix of content.fixes || []) {
      let recoverable = 0;
      for (const cid of fix.checks || []) {
        const check = filledChecks[cid];
        if (!check) contentOk = false;
        else recoverable += byId[cid].max - check.score;
      }
      if (!Number.isInteger(fix.points) || fix.points > recoverable) contentOk = false;
    }
    for (const opportunity of content.opportunities || []) {
      if (!(scores.opportunities || []).some((entry) => entry.id === opportunity.id)) contentOk = false;
    }
    contentOk ? pass("I26") : addHard("I26", "top gaps, fixes, or opportunities are not supported by structured output");
  }

  // I27 top gap labels and owner section
  const labels = (gaps || []).map((gap) => String(gap.confidence || "").replaceAll("_", " ").toUpperCase());
  labels.every((label) => onePage.toUpperCase().includes(label)) ? pass("I27") : addHard("I27", "a top-gap evidence label is missing from the one-pager");
  onePage.includes("Revenue Opportunities to Investigate") && onePage.includes("OWNER DATA REQUIRED")
    ? pass("I28")
    : addHard("I28", "owner-data section or label is missing from the one-pager");

  // I29 links
  const links = [...onePage.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]).filter((link) => link.endsWith(".md") && !/^https?:/.test(link));
  if (!links.length) addHard("I29", "one-pager has no local full-report link");
  else {
    const target = path.resolve(path.dirname(onePagePath), links[0]);
    exists(target) ? pass("I29") : addHard("I29", `one-pager link does not resolve: ${links[0]}`);
  }

  // I30 run metadata
  const runId = run?.run_id || filled.run?.run_id;
  runId && scores.meta?.run_id === runId && filled.business?.name === scores.meta?.client && filled.business?.trade === scores.meta?.trade
    ? pass("I30")
    : addHard("I30", "run ID, client, or trade metadata is inconsistent");

  // I31 no credentials in artifacts
  const forbidden = /(AIza[0-9A-Za-z_-]{30,}|GOCSPX-[0-9A-Za-z_-]{20,}|-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----|Authorization\s*:\s*(?:Bearer|Basic)\s+\S{12,}|\bBasic\s+[A-Za-z0-9+/=]{20,})/;
  !forbidden.test(JSON.stringify(filled)) && !forbidden.test(JSON.stringify(scores)) && !forbidden.test(onePage) && !forbidden.test(report)
    ? pass("I31")
    : addHard("I31", "credential-like material appears in an artifact");

  // I32 active cap disclosure
  const activeCaps = (scores.caps || []).filter((cap) => cap.active);
  if (activeCaps.length) {
    const capLabels = activeCaps.map((cap) => cap.label);
    const disclosed = /cap/i.test(onePage) && (/cap/i.test(report) || report.includes(String(scores.cap))) && capLabels.some((label) => onePage.includes(label) || report.includes(label));
    disclosed ? pass("I32") : addHard("I32", "an active hard cap is not disclosed in the reports");
  } else pass("I32");

  // I33 query universe hash and lock
  const computedHash = hashUniverse(filled.query_universe || {});
  const universeHash = filled.query_universe?.hash;
  const universeOk =
    filled.query_universe?.locked === true &&
    universeHash === computedHash &&
    filled.run?.query_universe_hash === universeHash &&
    scores.query_universe_hash === universeHash &&
    scores.meta?.query_universe_hash === universeHash &&
    (!queryUniverseFile || queryUniverseFile.hash === universeHash);
  universeOk ? pass("I33") : addHard("I33", "query universe hash or lock is inconsistent");

  // I34 metrics recomputation
  const metricsOk =
    deepEqual(scores.metrics, recomputedMetrics) &&
    deepEqual(scores.visibilityMatrix, recomputedMetrics.visibility_matrix) &&
    deepEqual((scores.metrics || {}).counts, { planned: filled.validity?.planned, collected: filled.validity?.collected });
  metricsOk ? pass("I34") : addHard("I34", "scores.metrics or visibility matrix does not match an independent recomputation");

  // I35 deterministic check derivation
  let deterministicOk = true;
  for (const item of items) {
    if (item.evaluation !== "deterministic") continue;
    const check = filledChecks[item.id];
    if (!check?.applicable) continue;
    const expectedCheck = derived.checks[item.id];
    if (!expectedCheck || check.score !== expectedCheck.score) deterministicOk = false;
  }
  deterministicOk ? pass("I35") : addHard("I35", "a deterministic check score does not match the normalized observations");

  // I36 validity gates. Compare gate identity and pass/fail state, not the
  // human-readable detail string, which may improve without invalidating an
  // otherwise reproducible historical audit.
  const gateState = (gates) =>
    JSON.stringify((gates || []).map((gate) => ({ id: gate.id, passed: gate.passed })).sort((a, b) => a.id.localeCompare(b.id)));
  const expectedGates = gateState(recomputedValidity.gates);
  const validityOk =
    gateState(scores.validity?.gates) === expectedGates &&
    scores.validity?.passed === recomputedValidity.passed &&
    recomputedValidity.passed === true &&
    gateState(filled.validity?.gates) === expectedGates;
  validityOk ? pass("I36") : addHard("I36", "validity gates are missing, inconsistent, or failed");

  // I37 AI source-type separation and competitor cohort linkage
  let aiOk = true;
  const surfaceById = new Map((filled.ai?.surfaces || []).map((surface) => [surface.id, surface]));
  for (const observation of filled.ai?.observations || []) {
    const surface = surfaceById.get(observation.surface_id);
    if (!surface || observation.source_type !== surface.source_type) aiOk = false;
    if (!["consumer_surface", "model_api"].includes(observation.source_type)) aiOk = false;
  }
  const businessIds = new Set((filled.competitors?.business || []).map((competitor) => competitor.id));
  for (const observation of [...(filled.maps?.observations || []), ...(filled.organic?.observations || [])]) {
    for (const competitor of observation.competitors || []) {
      // Every scored peer must resolve to the locked cohort. Live collection
      // marks unlocked local businesses with cohort=false and an "obs-" id;
      // those are contextual only and are never counted as business peers.
      const claimsCohort = competitor.cohort === true || String(competitor.id).startsWith("cmp-");
      if (claimsCohort && !businessIds.has(competitor.id)) aiOk = false;
      if (competitor.cohort === false && businessIds.has(competitor.id)) aiOk = false;
    }
  }
  aiOk ? pass("I37") : addHard("I37", "AI source types are pooled or a business competitor is outside the locked cohort");

  // I38 target match confidence
  let targetOk = true;
  for (const observation of [...(filled.maps?.observations || []), ...(filled.organic?.observations || [])]) {
    if (observation.not_collected) continue;
    if (observation.target_found) {
      if (!observation.target_match || Number(observation.target_match.confidence) < 0.8) targetOk = false;
    }
  }
  targetOk ? pass("I38") : addHard("I38", "a found target observation lacks a confident target match");

  // I39 owner-data separation in content
  if (content) {
    const ownerInChecks = (content.findings || []).some((entry) => String(entry.id).startsWith("OD-"));
    ownerInChecks ? addHard("I39", "content.findings contains an owner-data id") : pass("I39");
  } else pass("I39");

  // I40 no paid visibility in a scored check
  const paidChecks = (filled.maps?.observations || []).some((observation) => observation.paid_items > 0);
  if (paidChecks) {
    const paidMentioned = /paid/i.test(report) || /paid/i.test(onePage) || (content?.limitations || []).some((entry) => /paid/i.test(entry));
    paidMentioned ? pass("I40") : addSoft("I40", "paid Maps items were observed but are not mentioned as diagnostic");
  } else pass("I40");

  return { hard, soft, checks };
}

function mutationSuite(data) {
  const firstCheckId = data.rubric.items[0].id;
  const clone = () => JSON.parse(JSON.stringify(data));
  const mutations = [
    ["scores.total + 1", (d) => { d.scores.total += 1; }],
    ["category earned + 1", (d) => { d.scores.categories[0].earned += 1; }],
    ["invalid confidence", (d) => { d.filled.checks[firstCheckId].confidence = "certain"; }],
    ["clear evidence", (d) => { d.filled.checks[firstCheckId].evidence = []; }],
    ["delete a check", (d) => { delete d.filled.checks[firstCheckId]; }],
    ["force a cap", (d) => { d.filled.facts.non_branded_discovery_present = false; }],
    ["remove synthetic label", (d) => {
      d.onePage = d.onePage.replace(/synthetic/gi, "sample");
      d.report = d.report.replace(/synthetic/gi, "sample");
    }],
    ["wrong one-page total", (d) => { d.onePage = d.onePage.replace("| **Total** | **", "| **Total** | **9"); }],
    ["remove report finding row", (d) => { d.report = d.report.replace(/^\| LV-.*$/m, ""); }],
    ["score an owner-data id", (d) => { d.scores.checks.push({ id: "OD-LV-GSC-CLICKS", score: 1 }); }],
    ["remove source ref", (d) => { d.filled.checks[firstCheckId].evidence_refs = ["missing-source"]; }],
    ["change source method", (d) => { d.filled.sources[0].method = "live"; }],
    ["change source surface", (d) => { d.filled.sources[0].surface = "unknown_surface"; }],
    ["unlink top gap", (d) => { if (d.content) d.content.gaps[0].checkId = "LV-NOT-REAL"; }],
    ["tamper universe hash", (d) => {
      d.filled.query_universe.hash = `sha256:${"0".repeat(64)}`;
    }],
    ["tamper deterministic score", (d) => {
      const item = data.rubric.items.find((entry) => entry.evaluation === "deterministic" && d.filled.checks[entry.id]?.applicable);
      if (item) d.filled.checks[item.id].score = Math.max(0, d.filled.checks[item.id].score - 1);
    }],
    ["tamper metrics coverage", (d) => {
      d.scores.metrics.coverage.demand_weighted_coverage = Math.min(1, d.scores.metrics.coverage.demand_weighted_coverage + 0.1);
    }],
    ["break validity gate", (d) => {
      d.filled.validity.gates[0].passed = false;
    }],
    ["pool AI source types", (d) => {
      for (const surface of d.filled.ai.surfaces) surface.source_type = "consumer_surface";
    }],
    ["remove competitor from cohort", (d) => {
      d.filled.competitors.business.pop();
    }],
    ["drop target match confidence", (d) => {
      const observation = d.filled.maps.observations.find((entry) => entry.target_found && !entry.not_collected);
      if (observation) observation.target_match = { ...observation.target_match, confidence: 0.4 };
    }],
    ["score a conditional N/A check", (d) => {
      const item = data.rubric.items.find((entry) => entry.applicability === "conditional" && d.filled.checks[entry.id]?.applicable === false);
      if (item) {
        d.filled.checks[item.id].applicable = true;
        d.filled.checks[item.id].score = item.max;
        d.filled.checks[item.id].confidence = "verified";
        d.filled.checks[item.id].na_reason = "";
      }
    }],
  ];
  const survived = [];
  for (const [name, mutate] of mutations) {
    const copy = clone();
    mutate(copy);
    let result;
    try {
      result = makeChecker(copy);
    } catch {
      survived.push(name);
      continue;
    }
    if (result.hard.length === 0) survived.push(name);
  }
  return { pass: survived.length === 0, total: mutations.length, survived };
}

function fixtureCheck() {
  const fixtureCandidates = [
    path.join(import.meta.dirname, "fixtures", "acme-plumbing.audit.json"),
    path.join(process.cwd(), "examples", "acme-plumbing", "audit.filled.json"),
  ];
  const fixture = fixtureCandidates.find((file) => exists(file));
  const out = path.join("/tmp", `lv-verify-fixture-${process.pid}-${Date.now()}.json`);
  if (!fixture) {
    return { pass: false, detail: "golden fixture missing at scripts/fixtures/acme-plumbing.audit.json" };
  }
  try {
    execFileSync("python3", [
      path.join(import.meta.dirname, "score.py"),
      "--input", fixture,
      "--rubric", rubricPath,
      "--out", out,
      "--strict",
    ], { stdio: "ignore" });
    const result = readJson(out);
    fs.rmSync(out, { force: true });
    const example = readJson(scoresPath);
    return {
      pass: result.display === example.display && result.band === example.band && result.total === example.total,
      expected: { display: example.display, band: example.band, total: example.total },
      actual: { display: result.display, band: result.band, total: result.total },
      fixture: path.relative(process.cwd(), fixture).split(path.sep).join("/"),
    };
  } catch (error) {
    try { fs.rmSync(out, { force: true }); } catch {}
    return { pass: false, detail: String(error).slice(0, 200) };
  }
}

let data;
try {
  data = load();
} catch (error) {
  console.error(`error: could not load run: ${error.message}`);
  process.exit(2);
}

const baseline = makeChecker(data);
const mutation = has("mutation") ? mutationSuite(data) : null;
if (mutation) data.mutation = mutation;
const finalCheck = makeChecker(data);
const fixture = has("fixture") ? fixtureCheck() : null;
const passed = finalCheck.hard.length === 0 && (!mutation || mutation.pass) && (!fixture || fixture.pass);

const result = {
  result: passed ? "pass" : "fail",
  run_id: data.run?.run_id || data.filled?.run?.run_id || path.basename(runDir),
  rubric_version: data.rubric.version,
  score: data.scores.display,
  hard_failures: finalCheck.hard,
  soft_failures: finalCheck.soft,
  checks: finalCheck.checks,
  mutation_tests: mutation ? (mutation.pass ? "pass" : "fail") : "not_run",
  mutations: mutation ? mutation.survived : [],
  fixture,
  word_count: data.onePage.split(/\s+/).filter(Boolean).length,
};

const record = {
  schema_version: "1.0",
  run_id: result.run_id,
  verifier: "verify.mjs",
  date: localDate(),
  rubric_version: result.rubric_version,
  audit_mode: "public",
  result: result.result,
  query_universe_hash: data.filled?.run?.query_universe_hash || "",
  checks: finalCheck.checks,
  hard_failures: finalCheck.hard,
  soft_failures: finalCheck.soft,
  mutation_tests: result.mutation_tests,
  mutations: result.mutations,
  fixture,
  score: data.scores.display,
  word_count: result.word_count,
  waivers: [],
};
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(record, null, 2) + "\n", "utf8");

console.log(JSON.stringify(result, null, 2));
process.exit(passed ? 0 : 1);
