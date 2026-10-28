#!/usr/bin/env node
/** Offline pipeline tests for the Local Visibility Scorecard. */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildGrid } from "./lib/grid.mjs";
import { buildPlan } from "./lib/plan.mjs";
import { buildUniverse } from "./lib/universe.mjs";
import { DataForSeoClient, ProviderError } from "./providers/dataforseo/client.mjs";
import { authorizationHeader, credentialsPresent, normalizeBasicToken, redactSecrets } from "./providers/dataforseo/auth.mjs";
import { llmMentions } from "./providers/dataforseo/ai.mjs";
import { makeTarget, matchEntity, normalizeOrganicResult } from "./providers/dataforseo/normalize.mjs";
import { coordinate, googleMaps } from "./providers/dataforseo/serp.mjs";

const HERE = import.meta.dirname;
const ROOT = path.resolve(HERE, "..", "..", "..", "..");
const RUBRIC = path.join(HERE, "..", "references", "rubric.json");
const CONFIG = path.join(ROOT, "config", "market.example.json");
const FIXTURE = path.join(HERE, "fixtures", "acme-plumbing.audit.json");
const RAW_FIXTURE = path.join(HERE, "fixtures", "acme-plumbing.raw.json");
const JUDGMENT = path.join(HERE, "fixtures", "acme-plumbing.judgment.json");
const EXAMPLE = path.join(ROOT, "examples", "acme-plumbing");
const COLLECT = path.join(HERE, "collect.mjs");
const UNIVERSE = path.join(HERE, "build_universe.mjs");
const SCORE = path.join(HERE, "score.py");
const RENDER = path.join(HERE, "render.mjs");
const VERIFY = path.join(HERE, "verify.mjs");
const EVAL = path.join(HERE, "eval.mjs");
const JUDGE = path.join(HERE, "apply_judgment.mjs");
const PRIVACY = path.join(ROOT, "scripts", "privacy_scan.mjs");
const SCHEMAS = path.join(ROOT, "scripts", "check_schemas.mjs");

const temp = (label) => fs.mkdtempSync(path.join(os.tmpdir(), `lv-${label}-`));
const run = (command, args, options = {}) =>
  spawnSync(command, args, { encoding: "utf8", cwd: ROOT, ...options });

test("rubric validator accepts the canonical rubric", () => {
  const result = run("python3", [path.join(HERE, "validate_rubric.py")]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /52 checks/);
});

test("golden fixture scores 60 / C and is deterministic", () => {
  const dir = temp("score");
  try {
    const outA = path.join(dir, "a.json");
    const outB = path.join(dir, "b.json");
    for (const out of [outA, outB]) {
      const result = run("python3", [SCORE, "--input", FIXTURE, "--rubric", RUBRIC, "--out", out, "--strict"]);
      assert.equal(result.status, 0, result.stderr);
    }
    assert.equal(fs.readFileSync(outA, "utf8"), fs.readFileSync(outB, "utf8"));
    const scores = JSON.parse(fs.readFileSync(outA, "utf8"));
    assert.equal(scores.display, 60);
    assert.equal(scores.band, "C");
    assert.equal(scores.total, 59.9);
    assert.equal(scores.final, 59.9);
    assert.equal(scores.ownerDataRequired.length, 9);
    assert.ok(scores.ownerDataRequired.every((entry) => entry.publicScoreImpact === "none"));
    assert.equal(scores.normalization.na_checks.length, 2);
    assert.ok(scores.query_universe_hash.startsWith("sha256:"));
    assert.equal(scores.visibilityMatrix.length, 6);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("query universe is deterministic, locked, and reproducible", () => {
  const config = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
  const options = { createdAt: "2026-01-01T00:00:00Z", lockedAt: "2026-01-01T00:00:00Z", reviewer: "test" };
  const a = buildUniverse(config, options);
  const b = buildUniverse(config, options);
  assert.equal(a.hash, b.hash);
  assert.ok(a.hash.startsWith("sha256:"));
  assert.equal(a.locked, true);
  assert.equal(a.services.length, 6);
  assert.equal(a.queries.filter((query) => query.role === "core").length, 30);
  assert.equal(a.queries.filter((query) => query.grid === true).length, 8);
  assert.equal(a.prompts.length, 16);
  assert.ok(a.queries.filter((query) => query.role === "core").every((query) => query.brand === "non_brand"));
  assert.ok(Math.abs(a.intents.filter((intent) => intent.core && intent.brand === "non_brand").reduce((sum, intent) => sum + intent.weight, 0) - 1) < 0.02);

  const dir = temp("universe");
  try {
    const out = path.join(dir, "universe.json");
    let result = run(process.execPath, [UNIVERSE, "--config", CONFIG, "--out", out, "--created-at", "2026-01-01T00:00:00Z", "--locked-at", "2026-01-01T00:00:00Z", "--reviewer", "test"]);
    assert.equal(result.status, 0, result.stderr);
    result = run(process.execPath, [UNIVERSE, "--config", CONFIG, "--check", out]);
    assert.equal(result.status, 0, result.stderr);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("disabled conditions remove intents and queries before hashing", () => {
  const config = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
  config.configuration.emergency_service = false;
  config.configuration.near_me_demand = false;
  config.configuration.city_modified_demand = false;
  const options = { createdAt: "2026-01-01T00:00:00Z", lockedAt: "2026-01-01T00:00:00Z", reviewer: "test" };
  const a = buildUniverse(config, options);
  const b = buildUniverse(config, options);
  assert.equal(a.hash, b.hash);
  const classes = new Set(a.intents.map((intent) => intent.class));
  assert.equal(classes.has("emergency"), false);
  assert.equal(classes.has("near_me"), false);
  assert.equal(classes.has("city_modified"), false);
  assert.ok(a.queries.filter((query) => query.role === "core").length < 30);
  assert.ok(a.queries.filter((query) => query.role === "core").every((query) => !["emergency", "near_me", "city_modified"].includes(query.intent_class)));
  assert.ok(a.prompts.every((prompt) => a.intents.find((intent) => intent.id === prompt.intent_id)?.class !== "emergency"));
});

test("cost plan prices competitor authority tasks correctly", () => {
  const config = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
  const universe = buildUniverse(config, {
    createdAt: "2026-01-01T00:00:00Z",
    lockedAt: "2026-01-01T00:00:00Z",
    reviewer: "test",
  });
  const { grid } = buildGrid({
    center: config.market.center,
    radius_km: config.market.radius_km,
    size: config.configuration.grid_size,
  });
  const pricing = {
    schema_version: "1.0",
    tasks: {
      serp_google_organic: 1,
      serp_google_maps: 1,
      serp_google_local_finder: 1,
      serp_google_ai_mode: 1,
      llm_mentions: 1,
      labs_keyword_overview: 1,
      backlinks_summary: 1,
      backlinks_referring_domains: 1,
      business_listings_search: 1,
    },
  };
  const plan = buildPlan({
    universe,
    grid,
    configuration: config.configuration,
    pricing,
    competitorCount: 3,
    includeDemandTask: true,
    limits: { maxSerpTasks: 5000, maxAiTasks: 250 },
  });
  assert.equal(plan.backlinks_summary_tasks, 1);
  assert.equal(plan.referring_domains_tasks, 4);
  assert.equal(plan.cost.available, true);
  assert.equal(plan.cost.by_task.serp_google_organic.quantity, plan.local_pack_tasks + plan.organic_tasks);
  assert.equal(plan.cost.by_task.backlinks_summary.quantity, 1);
  assert.equal(plan.cost.by_task.backlinks_referring_domains.quantity, 4);
  assert.equal(
    plan.cost.total_usd,
    plan.local_pack_tasks +
      plan.maps_tasks +
      plan.organic_tasks +
      plan.ai_mode_tasks +
      plan.llm_mentions_tasks +
      plan.keyword_overview_tasks +
      plan.business_listings_tasks +
      1 +
      4,
  );
});

test("DataForSEO accepts a pre-encoded Basic Auth value without exposing it", () => {
  const token = Buffer.from("synthetic-login:synthetic-password").toString("base64");
  assert.equal(credentialsPresent({ DATAFORSEO_BASIC_AUTH: token }), true);
  assert.equal(authorizationHeader({ DATAFORSEO_BASIC_AUTH: token }), `Basic ${token}`);
  assert.equal(normalizeBasicToken(`Basic ${token}`), token);
  const redacted = redactSecrets(`Authorization: Basic ${token}`, { DATAFORSEO_BASIC_AUTH: token });
  assert.ok(!redacted.includes(token));
  assert.match(redacted, /Basic \[redacted\]/);
  assert.throws(() => authorizationHeader({ DATAFORSEO_BASIC_AUTH: "not-base64" }));
  assert.throws(() => authorizationHeader({}));
});

test("a missing cost ceiling stays unset on the provider client", () => {
  const env = { DATAFORSEO_LOGIN: "synthetic-login", DATAFORSEO_PASSWORD: "synthetic-password" };
  assert.equal(new DataForSeoClient({ env, useCache: false }).maxCostUsd, null);
  assert.equal(new DataForSeoClient({ env, useCache: false, maxCostUsd: null }).maxCostUsd, null);
  assert.equal(new DataForSeoClient({ env, useCache: false, maxCostUsd: 0.25 }).maxCostUsd, 0.25);
  assert.equal(new DataForSeoClient({ env, useCache: false, maxCostUsd: 0 }).maxCostUsd, 0);
});

test("DataForSEO task-level failures are not treated as empty SERPs", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response(
      JSON.stringify({
        status_code: 20000,
        status_message: "Ok.",
        tasks_error: 1,
        cost: 0.002,
        tasks: [
          {
            id: "synthetic-task",
            status_code: 40501,
            status_message: "Rate limit exceeded",
            result: null,
            cost: 0.002,
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const client = new DataForSeoClient({
    env: { DATAFORSEO_LOGIN: "synthetic-login", DATAFORSEO_PASSWORD: "synthetic-password" },
    fetchImpl,
    useCache: false,
    maxRetries: 0,
  });
  await assert.rejects(
    () => client.request("/v3/serp/google/organic/live/advanced", [{ keyword: "plumber" }], { taskType: "test" }),
    (error) => error instanceof ProviderError && error.status === 40501 && /task error/i.test(error.message),
  );
  assert.equal(calls, 1);
  assert.equal(client.errors.length, 1);
});

test("a partial name is not treated as a confirmed target match", () => {
  const target = makeTarget({ name: "Acme Plumbing", domain: "acme-plumbing.example" });
  const exact = matchEntity({ name: "Acme Plumbing", domain: "" }, target);
  assert.equal(exact.found, true);
  assert.equal(exact.confidence, 0.8);
  const ambiguous = matchEntity({ name: "Acme Plumbing & Drain", domain: "" }, target);
  assert.equal(ambiguous.found, false);
  assert.equal(ambiguous.ambiguous, true);
});

test("observed competitors are resolved to the locked cohort by identifier", () => {
  const target = makeTarget({
    name: "Acme Plumbing (synthetic)",
    domain: "acme-plumbing.example",
    place_id: "SYNTHETIC-PLACE-ACME-001",
  });
  const cohort = [
    {
      id: "cmp-blue-line",
      name: "Blue Line Plumbing (synthetic)",
      domain: "blueline-plumbing.example",
      place_id: "SYNTHETIC-PLACE-BLUE-002",
    },
  ];
  const response = {
    result: [
      {
        items: [
          {
            type: "organic",
            rank_group: 1,
            rank_absolute: 1,
            domain: "acme-plumbing.example",
            url: "https://acme-plumbing.example/",
            title: "Acme Plumbing",
            website_name: "Acme Plumbing",
          },
          {
            type: "organic",
            rank_group: 2,
            rank_absolute: 2,
            domain: "blueline-plumbing.example",
            url: "https://blueline-plumbing.example/",
            title: "Blue Line Plumbing",
            website_name: "Blue Line Plumbing",
          },
          {
            type: "organic",
            rank_group: 3,
            rank_absolute: 3,
            domain: "unlocked-plumbing.example",
            url: "https://unlocked-plumbing.example/",
            title: "Unlocked Plumbing",
            website_name: "Unlocked Plumbing",
          },
          {
            type: "organic",
            rank_group: 4,
            rank_absolute: 4,
            domain: "yelp.com",
            url: "https://www.yelp.com/search?find_desc=plumber",
            title: "Plumbers near you",
            website_name: "Yelp",
          },
        ],
      },
    ],
  };
  const normalized = normalizeOrganicResult(response, { target, competitors: cohort, serpOccupiers: [] });
  assert.equal(normalized.target_found, true);
  assert.equal(normalized.competitors.length, 3);
  assert.deepEqual(
    normalized.competitors.map((competitor) => competitor.id),
    ["cmp-blue-line", "obs-unlocked-plumbing-example", "serp-yelp-com"],
  );
  assert.equal(normalized.competitors[0].cohort, true);
  assert.equal(normalized.competitors[0].matched_by, "domain");
  assert.equal(normalized.competitors[1].cohort, false);
  assert.equal(normalized.competitors[2].type, "directory");
});

test("Maps requests disable search_places by default and clamp documented zoom ranges", async () => {
  const tasks = [];
  const client = {
    request: async (endpoint, [task]) => {
      tasks.push({ endpoint, task });
      return { result: [] };
    },
  };
  await googleMaps(client, { keyword: "plumber", lat: 34, lng: -117, depth: 20 });
  await googleMaps(client, { keyword: "plumber", lat: 34, lng: -117, depth: 20, search_places: true });
  assert.equal(tasks[0].task.search_places, false);
  assert.equal(tasks[1].task.search_places, true);
  assert.match(tasks[0].task.location_coordinate, /,14z$/);
  assert.match(coordinate(34, -117, 1, 4, 18), /,4z$/);
  assert.match(coordinate(34, -117, 99, 4, 18), /,18z$/);
});

test("ChatGPT LLM Mentions refuses unsupported markets and languages", async () => {
  const client = { request: async () => ({ result: [] }) };
  await assert.rejects(
    () => llmMentions(client, { keyword: "emergency plumber", platform: "chat_gpt", location_code: 2841 }),
    /United States/,
  );
  await assert.rejects(
    () => llmMentions(client, { keyword: "emergency plumber", platform: "chat_gpt", location_code: 2840, language_code: "es" }),
    /English only/,
  );
  const accepted = await llmMentions(client, {
    keyword: "emergency plumber",
    platform: "chat_gpt",
    location_code: 2840,
    language_code: "en",
  });
  assert.deepEqual(accepted, { result: [] });
});

test("audit wrapper labels only fixture verification as synthetic", () => {
  const dir = temp("wrapper");
  try {
    const out = path.join(dir, "run");
    const reportDir = path.join(dir, "report");
    const result = run(process.execPath, [
      path.join(ROOT, "scripts", "audit.mjs"),
      "--fixture", RAW_FIXTURE,
      "--out", out,
      "--report-dir", reportDir,
      "--run-id", "test",
    ]);
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stdout, /--mutation --synthetic/);
    assert.ok(fs.existsSync(path.join(out, "audit.json")));
    assert.ok(!fs.existsSync(path.join(out, "audit.filled.json")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("fixture collector needs no credentials and emits a pending worksheet", () => {
  const dir = temp("collect");
  try {
    const out = path.join(dir, "run");
    const env = { ...process.env };
    delete env.DATAFORSEO_LOGIN;
    delete env.DATAFORSEO_PASSWORD;
    delete env.DATAFORSEO_BASIC_AUTH;
    delete env.LV_MAX_RUN_COST_USD;
    const result = run(process.execPath, [COLLECT, "--fixture", RAW_FIXTURE, "--out", out, "--run-id", "test-run"], { env });
    assert.equal(result.status, 0, result.stderr);
    const audit = JSON.parse(fs.readFileSync(path.join(out, "audit.json"), "utf8"));
    assert.equal(audit.run.source_mode, "fixture");
    assert.equal(audit.run.synthetic, true);
    assert.equal(audit.review.status, "pending");
    assert.equal(Object.keys(audit.checks).length, 52);
    assert.equal(audit.maps.observations.length, 784);
    assert.equal(audit.organic.observations.length, 32);
    assert.equal(audit.ai.observations.length, 48);
    assert.equal(audit.query_universe.locked, true);
    assert.ok(audit.query_universe.hash.startsWith("sha256:"));
    assert.ok(audit.checks["LV-MAP-01"].score !== null);
    assert.equal(audit.checks["LV-ORG-05"].needs_review, true);
    assert.equal(audit.checks["LV-MAP-10"].applicable, false);
    assert.equal(audit.checks["LV-RES-05"].applicable, false);
    assert.ok(audit.validity.gates.every((gate) => gate.passed));
    assert.ok(fs.existsSync(path.join(out, "query-universe.json")));
    assert.ok(fs.existsSync(path.join(out, "metrics.json")));
    const schema = run(process.execPath, [SCHEMAS, "--raw-audit", path.join(out, "audit.json")]);
    assert.equal(schema.status, 0, schema.stderr + schema.stdout);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("live mode fails clearly without credentials and writes no audit", () => {
  const dir = temp("live");
  try {
    const env = { ...process.env };
    delete env.DATAFORSEO_LOGIN;
    delete env.DATAFORSEO_PASSWORD;
    delete env.DATAFORSEO_BASIC_AUTH;
    delete env.LV_MAX_RUN_COST_USD;
    const result = run(process.execPath, [COLLECT, "--config", CONFIG, "--out", path.join(dir, "run"), "--run-id", "test"], { env });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /DATAFORSEO_(LOGIN|PASSWORD)|credentials are not set/);
    assert.ok(!fs.existsSync(path.join(dir, "run", "audit.json")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("dry-run plan sends no paid request and writes no audit", () => {
  const dir = temp("plan");
  try {
    const out = path.join(dir, "run");
    const env = { ...process.env };
    delete env.DATAFORSEO_LOGIN;
    delete env.DATAFORSEO_PASSWORD;
    delete env.DATAFORSEO_BASIC_AUTH;
    delete env.LV_MAX_RUN_COST_USD;
    const result = run(process.execPath, [COLLECT, "--config", CONFIG, "--plan", "--out", out, "--run-id", "test"], { env });
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stdout, /Core keywords/);
    assert.match(result.stdout, /Safety ceilings/);
    const plan = JSON.parse(fs.readFileSync(path.join(out, "plan.json"), "utf8"));
    assert.equal(plan.total_task_count > 0, true);
    assert.equal(plan.over_budget, false);
    assert.ok(!fs.existsSync(path.join(out, "audit.json")));
    assert.ok(!fs.existsSync(path.join(out, "query-universe.json")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("an environment cost ceiling without local pricing blocks the live run", () => {
  const dir = temp("cost-ceiling");
  try {
    const env = { ...process.env, LV_MAX_RUN_COST_USD: "1" };
    delete env.DATAFORSEO_LOGIN;
    delete env.DATAFORSEO_PASSWORD;
    delete env.DATAFORSEO_BASIC_AUTH;
    const result = run(process.execPath, [COLLECT, "--config", CONFIG, "--out", path.join(dir, "run"), "--run-id", "test"], { env });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /reliable cost estimate is unavailable|pricing/i);
    assert.ok(!fs.existsSync(path.join(dir, "run", "audit.json")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a missing competitor cohort fails before any paid request", () => {
  const dir = temp("cohort-required");
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
    delete config.known_competitors;
    const configPath = path.join(dir, "config.json");
    fs.writeFileSync(configPath, JSON.stringify(config), "utf8");
    const env = { ...process.env };
    delete env.DATAFORSEO_LOGIN;
    delete env.DATAFORSEO_PASSWORD;
    delete env.DATAFORSEO_BASIC_AUTH;
    delete env.LV_MAX_RUN_COST_USD;
    const result = run(
      process.execPath,
      [COLLECT, "--config", configPath, "--plan", "--out", path.join(dir, "run"), "--run-id", "test"],
      { env },
    );
    assert.equal(result.status, 2);
    assert.match(result.stderr, /at least two are required before collection/);
    assert.ok(!fs.existsSync(path.join(dir, "run", "plan.json")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("unsupported AI surfaces fail before Maps and organic spending", () => {
  const dir = temp("unsupported-ai");
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
    config.ai_platforms = ["gemini"];
    const configPath = path.join(dir, "config.json");
    fs.writeFileSync(configPath, JSON.stringify(config), "utf8");
    const env = { ...process.env };
    delete env.DATAFORSEO_LOGIN;
    delete env.DATAFORSEO_PASSWORD;
    delete env.DATAFORSEO_BASIC_AUTH;
    delete env.LV_MAX_RUN_COST_USD;
    const result = run(
      process.execPath,
      [COLLECT, "--config", configPath, "--plan", "--out", path.join(dir, "run"), "--run-id", "test"],
      { env },
    );
    assert.equal(result.status, 2);
    assert.match(result.stderr, /unsupported AI surface in V1/);
    assert.ok(!fs.existsSync(path.join(dir, "run", "plan.json")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("ChatGPT on a non-US market fails before collection", () => {
  const dir = temp("ai-market");
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
    config.market.country = "CA";
    const configPath = path.join(dir, "config.json");
    fs.writeFileSync(configPath, JSON.stringify(config), "utf8");
    const env = { ...process.env };
    delete env.DATAFORSEO_LOGIN;
    delete env.DATAFORSEO_PASSWORD;
    delete env.DATAFORSEO_BASIC_AUTH;
    delete env.LV_MAX_RUN_COST_USD;
    const result = run(
      process.execPath,
      [COLLECT, "--config", configPath, "--plan", "--out", path.join(dir, "run"), "--run-id", "test"],
      { env },
    );
    assert.equal(result.status, 2);
    assert.match(result.stderr, /United States and English only/);
    assert.ok(!fs.existsSync(path.join(dir, "run", "plan.json")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a cost ceiling above the estimate stops before any paid request", () => {
  const dir = temp("priced-plan");
  try {
    const pricingPath = path.join(dir, "pricing.json");
    fs.writeFileSync(
      pricingPath,
      JSON.stringify({
        schema_version: "1.0",
        tasks: {
          serp_google_organic: 1,
          serp_google_maps: 1,
          serp_google_local_finder: 1,
          serp_google_ai_mode: 1,
          llm_mentions: 1,
          labs_keyword_overview: 1,
          backlinks_summary: 1,
          backlinks_referring_domains: 1,
          business_listings_search: 1,
        },
      }),
      "utf8",
    );
    const env = { ...process.env };
    delete env.DATAFORSEO_LOGIN;
    delete env.DATAFORSEO_PASSWORD;
    delete env.DATAFORSEO_BASIC_AUTH;
    delete env.LV_MAX_RUN_COST_USD;
    const result = run(
      process.execPath,
      [
        COLLECT,
        "--config", CONFIG,
        "--pricing", pricingPath,
        "--max-cost-usd", "1",
        "--out", path.join(dir, "run"),
        "--run-id", "test",
      ],
      { env },
    );
    assert.equal(result.status, 2);
    assert.match(result.stderr, /exceeds a configured safety ceiling|No paid request was sent/i);
    assert.ok(!fs.existsSync(path.join(dir, "run", "audit.json")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("renderer produces the one-pager and full report from structured scores", () => {
  const dir = temp("render");
  try {
    const onePage = path.join(dir, "one-page.md");
    const report = path.join(dir, "full-report.md");
    let result = run(process.execPath, [RENDER, "--scores", path.join(EXAMPLE, "scores.json"), "--content", path.join(EXAMPLE, "content.json"), "--out", onePage]);
    assert.equal(result.status, 0, result.stderr);
    result = run(process.execPath, [RENDER, "--mode", "full", "--scores", path.join(EXAMPLE, "scores.json"), "--content", path.join(EXAMPLE, "content.json"), "--out", report]);
    assert.equal(result.status, 0, result.stderr);
    const oneText = fs.readFileSync(onePage, "utf8");
    const fullText = fs.readFileSync(report, "utf8");
    assert.match(oneText, /^# 60 \/ 100/m);
    assert.match(oneText, /VERIFIED/);
    assert.match(oneText, /Signature visibility matrix/);
    assert.match(oneText, /Geo-grid findings|Visibility snapshot/);
    assert.match(fullText, /STRONG SIGNAL/);
    assert.match(fullText, /Geo-grid findings/);
    assert.match(fullText, /AI visibility/);
    assert.equal([...fullText.matchAll(/^\| LV-/gm)].length, 52);
    assert.ok(oneText.split(/\s+/).filter(Boolean).length <= 1200);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("offline judgment eval harness runs against the synthetic snapshot", () => {
  const dir = temp("eval");
  try {
    const out = path.join(dir, "result.json");
    const result = run(process.execPath, [EVAL, "--snapshot", EXAMPLE, "--mock", "--out", out]);
    assert.equal(result.status, 0, result.stderr + result.stdout);
    const data = JSON.parse(fs.readFileSync(out, "utf8"));
    assert.equal(data.mode, "mock");
    assert.equal(data.sampled_checks.length, 5);
    assert.ok(data.metrics.reviewed_responses > 0);
    assert.equal(data.metrics.hallucinated_check_ids, 0);
    assert.equal(data.metrics.unsupported_claim_rate, 0);
    assert.ok(data.metrics.evidence_citation_rate >= 0);
    assert.ok(Array.isArray(data.metrics.unstable_checks));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("verifier passes the synthetic example with mutations and fixture checks", () => {
  const dir = temp("verify");
  try {
    const out = path.join(dir, "verification.json");
    const result = run(process.execPath, [
      VERIFY,
      "--run", EXAMPLE,
      "--filled", path.join(EXAMPLE, "audit.filled.json"),
      "--scores", path.join(EXAMPLE, "scores.json"),
      "--content", path.join(EXAMPLE, "content.json"),
      "--report", path.join(EXAMPLE, "full-report.md"),
      "--one-page", path.join(EXAMPLE, "one-page.md"),
      "--out", out,
      "--mutation", "--fixture", "--synthetic",
    ]);
    assert.equal(result.status, 0, result.stderr + result.stdout);
    const record = JSON.parse(fs.readFileSync(out, "utf8"));
    assert.equal(record.result, "pass");
    assert.equal(record.mutation_tests, "pass");
    assert.equal(record.fixture.pass, true);
    assert.equal(record.score, 60);
    assert.ok(record.checks.I35);
    assert.ok(record.checks.I36);
    assert.ok(record.checks.I37);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("judgment merger accepts only applicable judgment checks", () => {
  const dir = temp("judgment");
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(EXAMPLE, "audit.raw.json"), "utf8"));
    const input = path.join(dir, "audit.json");
    const out = path.join(dir, "reviewed.json");
    fs.writeFileSync(input, JSON.stringify(raw), "utf8");
    const ok = run(process.execPath, [JUDGE, "--audit", input, "--judgment", JUDGMENT, "--out", out]);
    assert.equal(ok.status, 0, ok.stderr);
    const reviewed = JSON.parse(fs.readFileSync(out, "utf8"));
    assert.equal(reviewed.checks["LV-AI-04"].score, 2);
    assert.equal(reviewed.checks["LV-AI-04"].review.method, "model_judgment");
    assert.equal(reviewed.review.status, "complete");

    const proposal = path.join(dir, "bad.json");
    fs.writeFileSync(proposal, JSON.stringify({
      schema_version: "1.0",
      audit_mode: "public",
      model: { name: "synthetic-reviewer" },
      checks: {
        "LV-MAP-01": {
          score: 3,
          confidence: "verified",
          evidence: ["Deterministic test."],
          evidence_refs: ["google-local-pack"],
        },
      },
    }), "utf8");
    const bad = run(process.execPath, [JUDGE, "--audit", input, "--judgment", proposal, "--out", out, "--allow-partial"]);
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /deterministic check cannot be model-judged/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("privacy scanner fails on synthetic DataForSEO credentials and never prints them", () => {
  const dir = temp("privacy-bad");
  try {
    const password = "syntheticDataForSeoPassword123";
    const basic = Buffer.from("synthetic-login:synthetic-password").toString("base64");
    fs.writeFileSync(path.join(dir, "leak.md"), `DATAFORSEO_PASSWORD=${password}\nDATAFORSEO_BASIC_AUTH=${basic}\nAuthorization: Basic ${basic}\n`, "utf8");
    const result = run(process.execPath, [PRIVACY, "--dir", dir]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /DataForSEO|authorization/i);
    assert.ok(!result.stderr.includes(password), "scanner must redact the value");
    assert.ok(!result.stdout.includes(password), "scanner must redact the value");
    assert.ok(!result.stderr.includes(basic), "scanner must redact the Basic value");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("privacy scanner passes a clean synthetic directory", () => {
  const dir = temp("privacy-clean");
  try {
    fs.writeFileSync(
      path.join(dir, "notes.md"),
      "Synthetic business at 123 Example Street. Phone (555) 010-0200. Email hello@example.com. No credentials.\n",
      "utf8",
    );
    const result = run(process.execPath, [PRIVACY, "--dir", dir]);
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stdout, /no hard privacy findings/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("privacy scanner rejects a real-looking customer address", () => {
  const dir = temp("privacy-address");
  // Build the fixture at runtime so the scanner does not flag this source file.
  const address = ["1234", "Maple", "Avenue"].join(" ");
  try {
    fs.writeFileSync(path.join(dir, "report.md"), `Customer: ${address}, Springfield\n`, "utf8");
    const result = run(process.execPath, [PRIVACY, "--dir", dir]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /street-address-like text/);
    assert.ok(!result.stderr.includes(address), "scanner must not print the detected address");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("repository privacy scan and schema check pass", () => {
  const privacy = run(process.execPath, [PRIVACY]);
  assert.equal(privacy.status, 0, privacy.stderr + privacy.stdout);
  const schemas = run(process.execPath, [SCHEMAS]);
  assert.equal(schemas.status, 0, schemas.stderr + schemas.stdout);
});

test("score.py rejects a malformed audit without writing a score", () => {
  const dir = temp("bad-audit");
  try {
    const audit = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
    audit.checks["LV-MAP-01"].evidence_refs = ["unknown-source"];
    const input = path.join(dir, "audit.json");
    const out = path.join(dir, "scores.json");
    fs.writeFileSync(input, JSON.stringify(audit), "utf8");
    const result = run("python3", [SCORE, "--input", input, "--out", out, "--strict"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unknown source/);
    assert.ok(!fs.existsSync(out));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
