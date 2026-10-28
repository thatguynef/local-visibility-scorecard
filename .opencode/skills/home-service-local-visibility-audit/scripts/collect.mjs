#!/usr/bin/env node
/**
 * Local Visibility Scorecard collector.
 *
 * Fixture mode performs no network access and needs no credentials.
 * Live mode uses DataForSEO through the provider layer and enforces explicit
 * timeouts, bounded retries/concurrency, a local raw-response cache, a task
 * ceiling, and an optional cost ceiling.
 *
 * The collector writes a pending worksheet. Deterministic checks are pre-filled
 * from normalized observations; judgment checks remain for review.
 *
 * Non-destructive: search and data-provider requests only. It never calls,
 * texts, emails, submits a form, books, posts, replies, or changes a profile.
 */

import fs from "node:fs";
import path from "node:path";
import { buildUniverse, hashUniverse, serviceKey } from "./lib/universe.mjs";
import { buildGrid } from "./lib/grid.mjs";
import { buildPlan, formatPlan, validatePricing } from "./lib/plan.mjs";
import { deriveAudit, computeMetrics, evaluateValidity } from "./lib/metrics.mjs";
import {
  DataForSeoClient,
  ProviderError,
  businessListingsSearch,
  classifyDomain,
  googleAiMode,
  googleLocalFinder,
  googleMaps,
  googleOrganic,
  keywordOverview,
  llmMentions,
  makeTarget,
  normalizeAiModeResult,
  normalizeBacklinksSummary,
  normalizeBusinessListings,
  normalizeKeywordOverview,
  normalizeLlmMentionsResult,
  normalizeLocalFinderResult,
  normalizeLocalPackResult,
  normalizeMapsResult,
  normalizeOrganicResult,
  normalizeReferringDomains,
  redactSecrets,
  referringDomains,
  resolveTargetFromListings,
} from "./providers/dataforseo/index.mjs";

const COLLECTOR_VERSION = "1.0.0";
const DEFAULT_MAX_SERP_TASKS = 5000;
const DEFAULT_MAX_AI_TASKS = 250;

const HELP = `Local Visibility Scorecard collector ${COLLECTOR_VERSION}

Usage:
  node collect.mjs --fixture <raw.json> [--out <dir>] [--run-id <id>]
  node collect.mjs --config <market.json> [--plan|--dry-run] [options]

Modes:
  --fixture <json>          Read a synthetic normalized fixture; zero network, zero credentials
  --config <json>           Market configuration for live Public Mode
  --mode public             Only public mode is implemented in V1

Live safety:
  --plan                    Print task counts and ceilings; send no request
  --dry-run                 Same as --plan; never sends a paid request
  --max-serp-tasks <n>      SERP task ceiling, default ${DEFAULT_MAX_SERP_TASKS}
  --max-ai-tasks <n>        AI task ceiling, default ${DEFAULT_MAX_AI_TASKS}
  --max-cost-usd <n>        Cost ceiling; requires --pricing with real local prices
  --pricing <json>          Local pricing file (config/pricing.example.json has no prices)
  --grid-size <n>           Override grid size (3, 5, 7, or a documented custom size)
  --ai-repeats <n>          Override AI repeats
  --max-queries <n>         Override core-query ceiling
  --allow-over-budget       Explicit opt-in to exceed a configured ceiling
  --no-cache                Disable the local raw-response cache

Output:
  --out <dir>               Default: .audit/<slug>/<run-id>
  --run-id <id>             Default: local date-time
  --universe <json>         Use a pre-built locked universe
  --cache-dir <dir>         Default: .cache/dataforseo

Environment:
  DATAFORSEO_LOGIN          Read from the shell only; never from .env
  DATAFORSEO_PASSWORD       Read from the shell only; never from .env
  LV_REQUEST_TIMEOUT_MS     Default 15000
  LV_MAX_CONCURRENCY        Default 4

The collector never writes credentials, authorization headers, cookies, or raw
provider responses into an audit artifact.
`;

const has = (name) => process.argv.includes(`--${name}`);
if (has("help") || process.argv.includes("-h")) {
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
const numericEnv = (name, fallback, minimum = 1000) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= minimum ? Math.floor(value) : fallback;
};
const numericArg = (name, fallback) => {
  const value = arg(name);
  if (value === undefined || value === true) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const mode = String(arg("mode", "public"));
if (mode !== "public") {
  console.error("error: only --mode public is implemented in V1. Connected mode is a documented future mode.");
  process.exit(2);
}
const fixturePath = arg("fixture");
if (fixturePath === true) {
  console.error("error: --fixture requires a path");
  process.exit(2);
}
const configPath = arg("config");
if (configPath === true) {
  console.error("error: --config requires a path");
  process.exit(2);
}
if (!fixturePath && !configPath) {
  console.error("error: provide --fixture for fixture mode or --config for live mode");
  process.exit(2);
}

const localRunId = (now = new Date()) =>
  new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16).replace(/:/g, "");
const RUN_ID = String(arg("run-id", localRunId()));
const nowIso = new Date().toISOString();
const RUBRIC_PATH = path.join(import.meta.dirname, "..", "references", "rubric.json");
const RUBRIC = JSON.parse(fs.readFileSync(RUBRIC_PATH, "utf8"));

function slugFrom(value) {
  return (
    String(value || "business")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "business"
  );
}

function source(id, spec) {
  return {
    id,
    provider: spec.provider || "dataforseo",
    type: spec.type || "serp",
    method: spec.method || "live",
    endpoint_family: spec.endpoint_family || "serp",
    surface: spec.surface || "unknown",
    collected_at: spec.collected_at || nowIso,
    collector_version: COLLECTOR_VERSION,
    location_method: spec.location_method || "not_applicable",
    language: spec.language || "en",
    device: spec.device || "mobile",
    field_completeness: Number.isFinite(spec.field_completeness) ? spec.field_completeness : 100,
    ...(spec.endpoint ? { endpoint: spec.endpoint } : {}),
    ...(spec.notes ? { notes: spec.notes } : {}),
  };
}

function readJson(file, label) {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  } catch (error) {
    console.error(`error: could not read ${label}: ${error.message}`);
    process.exit(2);
  }
}

function loadPricing() {
  const pricingPath = arg("pricing");
  if (!pricingPath) return null;
  if (pricingPath === true) {
    console.error("error: --pricing requires a path");
    process.exit(2);
  }
  try {
    return validatePricing(readJson(pricingPath, "pricing"));
  } catch (error) {
    console.error(`error: ${error.message}`);
    process.exit(2);
  }
}

function applyOverrides(config) {
  const gridSize = numericArg("grid-size", null);
  const aiRepeats = numericArg("ai-repeats", null);
  const maxQueries = numericArg("max-queries", null);
  if (gridSize !== null) config.configuration.grid_size = gridSize;
  if (aiRepeats !== null) config.configuration.ai_repeats = aiRepeats;
  if (maxQueries !== null) config.configuration.max_queries = maxQueries;
  return config;
}

function validateConfig(config) {
  if (!config.business?.name || !config.business?.trade) throw new Error("configuration.business name and trade are required");
  if (!config.market?.name || !config.market?.center) throw new Error("configuration.market name and center are required");
  if (!Array.isArray(config.services) || !config.services.length) throw new Error("configuration.services must be a non-empty array");
  const configuration = config.configuration || {};
  for (const key of [
    "emergency_service",
    "near_me_demand",
    "city_modified_demand",
    "local_finder_configured",
    "branded_diagnostics_enabled",
    "historical_runs_available",
  ]) {
    if (typeof configuration[key] !== "boolean") throw new Error(`configuration.${key} must be a boolean`);
  }
  for (const key of ["ai_repeats", "grid_size", "max_queries"]) {
    if (!Number.isInteger(configuration[key]) || configuration[key] <= 0) {
      throw new Error(`configuration.${key} must be a positive integer`);
    }
  }
  return config;
}

function loadUniverseForConfig(config) {
  const universePath = arg("universe");
  if (universePath && universePath !== true) {
    const universe = readJson(universePath, "query universe");
    const rebuilt = hashUniverse(universe);
    if (universe.schema_version !== "1.0") throw new Error("query universe schema_version must be 1.0");
    if (universe.hash !== rebuilt) throw new Error("query universe hash does not match its content");
    if (!universe.locked) throw new Error("query universe must be locked before collection");
    if (universe.trade !== config.business.trade) throw new Error("query universe trade does not match the configuration");
    if (universe.market?.name !== config.market.name) throw new Error("query universe market does not match the configuration");
    return universe;
  }
  return buildUniverse(config, {
    createdAt: config.created_at || nowIso,
    lockedAt: nowIso,
    reviewer: "collector",
    demandSource: "configured_market_config",
  });
}

function gridFor(config) {
  const { grid, points } = buildGrid({
    center: config.market.center,
    radius_km: Number(config.market.radius_km) || 10,
    size: Number(config.configuration.grid_size) || 7,
  });
  return { grid, points };
}

/* ------------------------------------------------------------------ */
/* Fixture mode                                                        */
/* ------------------------------------------------------------------ */

function fixtureCollect() {
  const fixture = readJson(fixturePath, "fixture");
  if (fixture.synthetic !== true) {
    console.error("error: a tracked fixture must set synthetic=true");
    process.exit(2);
  }
  const required = ["business", "market", "configuration", "query_universe", "sources", "maps", "organic", "ai", "competitors", "authority", "resilience"];
  for (const key of required) {
    if (!fixture[key]) {
      console.error(`error: fixture is missing ${key}`);
      process.exit(2);
    }
  }
  const universe = fixture.query_universe;
  const rebuiltHash = hashUniverse(universe);
  if (universe.hash !== rebuiltHash) {
    console.error("error: fixture query universe hash does not match its content");
    process.exit(2);
  }
  const validity = {
    provider_error_rate: 0,
    critical_source_outage: false,
    planned: { core_queries: 0, maps_observations: 0, organic_observations: 0, ai_prompt_runs: 0 },
    collected: { core_queries: 0, maps_observations: 0, organic_observations: 0, ai_prompt_runs: 0 },
    notes: ["Synthetic fixture. No network access, no credentials, no production data."],
    ...(fixture.validity || {}),
  };
  const audit = {
    schema_version: "1.0",
    audit_mode: "public",
    run: {
      run_id: RUN_ID,
      started_at: fixture.collected_at || "2026-01-01T00:00:00Z",
      finished_at: fixture.collected_at || "2026-01-01T00:00:00Z",
      collector_version: COLLECTOR_VERSION,
      rubric_version: RUBRIC.version,
      source_mode: "fixture",
      synthetic: true,
      query_universe_hash: universe.hash,
    },
    business: fixture.business,
    market: fixture.market,
    configuration: fixture.configuration,
    query_universe: universe,
    sources: fixture.sources,
    validity,
    maps: fixture.maps,
    organic: fixture.organic,
    ai: fixture.ai,
    competitors: fixture.competitors,
    authority: fixture.authority,
    resilience: fixture.resilience,
    metrics: {},
    facts: {},
    checks: {},
    limitations: fixture.limitations || [
      "Synthetic fixture. No network access, no credentials, no production data.",
      "Public Mode observes discovery only; GBP and Website Scorecards diagnose the downstream surfaces.",
    ],
    review: {
      status: "pending",
      notes: [
        ...(fixture.notes || []),
        "Deterministic checks are derived from normalized observations; judgment checks remain for review.",
        "No paid provider request was made.",
      ],
    },
  };
  return { audit, universe, plan: null, sourceMode: "fixture", synthetic: true };
}

/* ------------------------------------------------------------------ */
/* Live mode                                                           */
/* ------------------------------------------------------------------ */

function competitorCohort(config) {
  const business = (config.known_competitors || []).map((competitor, index) => ({
    id: competitor.id || `cmp-${index + 1}`,
    name: competitor.name,
    ...(competitor.place_id ? { place_id: competitor.place_id } : {}),
    ...(competitor.domain ? { domain: competitor.domain } : {}),
    aliases: competitor.aliases || [],
    selection_reason: "configured_market_competitor_locked_before_collection",
  }));
  const occupiers = (config.serp_occupiers || []).map((domain) => {
    const type = classifyDomain(domain, config.serp_occupiers || []);
    return {
      id: `serp-${domain.replace(/[^a-z0-9]+/gi, "-")}`,
      name: domain,
      domain,
      type: ["directory", "publisher", "marketplace", "manufacturer", "government", "social_community", "other"].includes(type)
        ? type
        : "publisher",
      selection_reason: "configured_serp_occupier",
    };
  });
  return {
    locked: true,
    selection_method: "configured_known_competitors_locked_before_collection",
    business,
    serp_occupiers: occupiers,
    ai: business.map((entry) => ({ ...entry, type: "local_business", selection_reason: "business_competitor_ai_cohort" })),
  };
}

function aiSurfaces(config) {
  const platforms = config.configuration.ai_surfaces || config.ai_platforms || ["google_ai_mode"];
  const surfaces = [];
  for (const platform of platforms) {
    if (platform === "google_ai_mode") {
      surfaces.push({
        id: "google-ai-mode",
        platform: "google",
        product_surface: "Google AI Mode",
        source_type: "consumer_surface",
        method: "serp_ai_mode",
        provider: "dataforseo",
        validated: true,
        available: true,
        model_version: "",
      });
    } else if (platform === "chatgpt") {
      const country = String(config.market?.country || "").toUpperCase();
      const language = String(config.market?.language || "").toLowerCase();
      if (country !== "US" || language !== "en") {
        throw new Error(
          "ChatGPT LLM Mentions is available for the United States and English only. " +
            "Remove the chatgpt surface or use a supported market configuration.",
        );
      }
      surfaces.push({
        id: "chatgpt-llm",
        platform: "chatgpt",
        product_surface: "ChatGPT (LLM Mentions)",
        source_type: "model_api",
        method: "llm_mentions",
        provider: "dataforseo",
        validated: true,
        available: true,
        model_version: "",
      });
    } else {
      throw new Error(`unsupported AI surface in V1: ${platform}`);
    }
  }
  return surfaces;
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let index = 0;
  const run = async () => {
    while (true) {
      const current = index;
      index += 1;
      if (current >= items.length) return;
      results[current] = await worker(items[current], current);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function liveCollect() {
  let config;
  try {
    config = validateConfig(applyOverrides(readJson(configPath, "market configuration")));
  } catch (error) {
    console.error(`error: ${error.message}`);
    process.exit(2);
  }
  const pricing = loadPricing();
  let universe;
  try {
    universe = loadUniverseForConfig(config);
  } catch (error) {
    console.error(`error: ${error.message}`);
    process.exit(2);
  }
  const coreQueries = universe.queries.filter((query) => query.role === "core" && query.brand === "non_brand");
  if (coreQueries.length > config.configuration.max_queries) {
    console.error(
      `error: the locked universe has ${coreQueries.length} core queries, above the configured --max-queries ${config.configuration.max_queries}. ` +
        "Reduce the services or raise the ceiling explicitly.",
    );
    process.exit(2);
  }
  let grid;
  let gridPoints;
  try {
    ({ grid, points: gridPoints } = gridFor(config));
  } catch (error) {
    console.error(`error: could not build the geo-grid: ${error.message}`);
    process.exit(2);
  }
  const cohort = competitorCohort(config);
  if (cohort.business.length < 2) {
    console.error(
      `error: the locked competitor cohort has ${cohort.business.length} business competitor(s); ` +
        "at least two are required before collection. Add config.known_competitors.",
    );
    process.exit(2);
  }
  // Validate configured AI surfaces before any paid request. An unsupported
  // platform should fail the plan, not surface after Maps and organic spending.
  try {
    aiSurfaces(config);
  } catch (error) {
    console.error(`error: ${error.message}`);
    process.exit(2);
  }
  const universeArg = arg("universe");
  const includeDemandTask = !(universeArg && universeArg !== true);
  let plan = buildPlan({
    universe,
    grid,
    configuration: config.configuration,
    pricing,
    competitorCount: cohort.business.length,
    includeDemandTask,
    limits: {
      maxSerpTasks: numericArg("max-serp-tasks", numericEnv("LV_MAX_SERP_TASKS", DEFAULT_MAX_SERP_TASKS, 1)),
      maxAiTasks: numericArg("max-ai-tasks", numericEnv("LV_MAX_AI_TASKS", DEFAULT_MAX_AI_TASKS, 1)),
      maxCostUsd: arg("max-cost-usd", numericEnv("LV_MAX_RUN_COST_USD", null, 0.01)),
      maxQueries: config.configuration.max_queries,
    },
  });
  const maxCostArg = arg("max-cost-usd");
  if (maxCostArg !== undefined && !plan.cost.available) {
    console.error(
      "error: --max-cost-usd was supplied but a reliable cost estimate is unavailable. " +
        "Pass --pricing with your contracted task prices, or use task ceilings only.",
    );
    process.exit(2);
  }
  if (has("plan") || has("dry-run")) {
    console.log(formatPlan(plan));
    const outArg = arg("out", path.join(".audit", slugFrom(config.business.name), RUN_ID));
    if (outArg !== true) {
      const out = path.resolve(outArg);
      fs.mkdirSync(out, { recursive: true });
      fs.writeFileSync(path.join(out, "plan.json"), JSON.stringify(plan, null, 2) + "\n", "utf8");
      console.log(`\nwrote ${path.join(out, "plan.json")}`);
    }
    process.exit(0);
  }
  // A cost ceiling configured through the environment must be estimated before
  // the run, exactly like --max-cost-usd. Do not fall back to a post-hoc check
  // after money has already been spent.
  if (plan.limits.max_cost_usd !== null && !plan.cost.available) {
    console.error(formatPlan(plan));
    console.error(
      "\nerror: a cost ceiling is configured but a reliable cost estimate is unavailable. " +
        "Pass --pricing with your contracted task prices, or remove the cost ceiling and use task ceilings only.",
    );
    process.exit(2);
  }
  if (plan.over_budget && !has("allow-over-budget")) {
    console.error(formatPlan(plan));
    console.error("\nerror: the plan exceeds a configured safety ceiling. No paid request was sent.");
    console.error("Use --allow-over-budget only after reviewing the plan, or raise the relevant ceiling.");
    process.exit(2);
  }
  if (plan.over_budget) {
    console.error(formatPlan(plan));
    console.error("\nwarning: --allow-over-budget was supplied. The plan exceeds a configured ceiling.");
  }

  const client = new DataForSeoClient({
    timeoutMs: numericEnv("LV_REQUEST_TIMEOUT_MS", 15000, 1000),
    maxConcurrency: numericEnv("LV_MAX_CONCURRENCY", 4, 1),
    maxTasks: plan.total_task_count + 5,
    // --allow-over-budget is the explicit opt-in. Without it, the client keeps
    // the same hard cost ceiling as the plan; with it, the operator has chosen
    // to proceed and the post-run actual cost is still recorded locally.
    maxCostUsd: has("allow-over-budget") ? null : plan.limits.max_cost_usd,
    cacheDir: arg("cache-dir", undefined) === undefined ? undefined : String(arg("cache-dir")),
    useCache: !has("no-cache"),
  });

  const startedAt = nowIso;
  const sources = new Map();
  const ensureSource = (id, spec) => {
    if (!sources.has(id)) sources.set(id, source(id, spec));
  };

  // Demand is collected before visibility so the locked universe is not tuned
  // after the rankings are known. If the demand call fails, the configured
  // demand is used and the limitation is recorded.
  let demandNote = "";
  if (includeDemandTask) {
    try {
      const keywords = [
        ...new Set(
          [config.business.trade, ...config.services.map((service) => service.label)]
            .map((keyword) => String(keyword || "").trim())
            .filter(Boolean),
        ),
      ];
      const demandResponse = await keywordOverview(client, {
        keywords,
        location_code: config.market.location_code || config.provider?.location_code || 2840,
        language_code: universe.language,
      });
      ensureSource("keyword-demand", {
        type: "demand",
        endpoint_family: "dataforseo_labs",
        surface: "google_keyword_data",
        location_method: "location_code",
        language: universe.language,
        device: universe.device,
        field_completeness: 70,
        endpoint: "/v3/dataforseo_labs/google/keyword_overview/live",
      });
      const demand = normalizeKeywordOverview(demandResponse);
      let updated = 0;
      for (const service of config.services) {
        const match =
          demand.get(String(service.label || "").toLowerCase()) ||
          demand.get(String(config.business.trade || "").toLowerCase());
        if (match && match.search_volume > 0) {
          service.demand = {
            ...service.demand,
            volume: match.search_volume,
            cpc: match.cpc,
            trend: match.trend / 100,
            source: "dataforseo_keyword_overview",
          };
          updated += 1;
        }
      }
      if (updated) {
        universe = buildUniverse(config, {
          createdAt: config.created_at || nowIso,
          lockedAt: nowIso,
          reviewer: "collector",
          demandSource: "configured_market_config",
        });
        const refreshedCoreQueries = universe.queries.filter((query) => query.role === "core" && query.brand === "non_brand");
        if (refreshedCoreQueries.length > config.configuration.max_queries) {
          throw new Error(`demand-enriched universe has ${refreshedCoreQueries.length} core queries, above --max-queries`);
        }
        plan = buildPlan({
          universe,
          grid,
          configuration: config.configuration,
          pricing,
          competitorCount: cohort.business.length,
          includeDemandTask,
          limits: {
            maxSerpTasks: numericArg("max-serp-tasks", numericEnv("LV_MAX_SERP_TASKS", DEFAULT_MAX_SERP_TASKS, 1)),
            maxAiTasks: numericArg("max-ai-tasks", numericEnv("LV_MAX_AI_TASKS", DEFAULT_MAX_AI_TASKS, 1)),
            maxCostUsd: arg("max-cost-usd", numericEnv("LV_MAX_RUN_COST_USD", null, 0.01)),
            maxQueries: config.configuration.max_queries,
          },
        });
        if (plan.over_budget && !has("allow-over-budget")) {
          throw new Error("the demand-enriched plan exceeds a configured safety ceiling");
        }
        demandNote = `Demand enriched from DataForSEO keyword data for ${updated} service(s).`;
      } else {
        demandNote = "Keyword demand was returned but no service volume matched; configured demand was used.";
      }
    } catch (error) {
      demandNote = `Demand enrichment was unavailable; configured demand was used. ${redactSecrets(error.message).slice(0, 180)}`;
    }
  }
  ensureSource("query-universe", {
    provider: "local",
    type: "query_universe",
    method: "derived",
    endpoint_family: "local",
    surface: "query_universe",
    location_method: "not_applicable",
    language: universe.language,
    device: universe.device,
    field_completeness: 100,
  });

  const target = makeTarget(config.business);
  if (!target.domain) {
    console.error("error: live mode requires a domain in configuration.business for authority comparison and target matching");
    process.exit(2);
  }

  // Resolve the target before scoring. A failed resolution is a validity gate,
  // not a rank-not-found result.
  let listingsResponse = null;
  let resolution;
  try {
    listingsResponse = await businessListingsSearch(client, {
      title: target.name,
      center: config.market.center,
      radius_km: config.market.radius_km,
      limit: 10,
    });
    ensureSource("business-listings", {
      type: "business_listings",
      endpoint_family: "business_data",
      surface: "business_listings",
      location_method: "coordinate",
      language: universe.language,
      device: universe.device,
      field_completeness: 85,
      endpoint: "/v3/business_data/business_listings/search/live",
    });
    const resolved = resolveTargetFromListings(listingsResponse, target);
    resolution = resolved.resolved
      ? { resolved: true, method: resolved.method, confidence: resolved.confidence, notes: "Resolved against DataForSEO business listings." }
      : { resolved: false, method: null, confidence: 0, notes: "No business listing matched the configured identifiers." };
  } catch (error) {
    resolution = { resolved: false, method: null, confidence: 0, notes: redactSecrets(error.message).slice(0, 240) };
  }
  if (!resolution.resolved && (config.business.place_id || config.business.phone)) {
    resolution = {
      resolved: true,
      method: "manual_verified",
      confidence: 0.8,
      notes: "Business listings did not confirm the entity; the audit relies on configured place ID or phone. Review before scoring.",
    };
  }
  if (!resolution.resolved) {
    console.error("error: the target business could not be resolved reliably. No audit was written.");
    console.error(`detail: ${resolution.notes}`);
    process.exit(1);
  }

  const business = {
    ...config.business,
    domain: target.domain,
    resolution,
  };

  // Maps / Local Pack / Local Finder.
  const gridQueries = coreQueries.filter((query) => query.grid === true);
  const mapsTaskList = [];
  for (const query of gridQueries) {
    for (const point of gridPoints) {
      mapsTaskList.push({ surface: "google_local_pack", query, point });
      mapsTaskList.push({ surface: "google_maps", query, point });
      if (config.configuration.local_finder_configured) {
        mapsTaskList.push({ surface: "google_local_finder", query, point });
      }
    }
  }
  const mapsObservations = await mapLimit(mapsTaskList, 6, async (task) => {
    const base = {
      id: `MAP-${task.surface.replace("google_", "").toUpperCase()}-${task.query.intent_id}-${task.point.point_id}`,
      intent_id: task.query.intent_id,
      query: task.query.text,
      surface: task.surface,
      point_id: task.point.point_id,
      lat: task.point.lat,
      lng: task.point.lng,
      collected_at: nowIso,
    };
    try {
      let response;
      if (task.surface === "google_local_pack") {
        response = await googleOrganic(client, {
          keyword: task.query.text,
          location_coordinate: `${task.point.lat.toFixed(6)},${task.point.lng.toFixed(6)},2000`,
          language_code: universe.language,
          device: universe.device,
          depth: 20,
        });
      } else if (task.surface === "google_maps") {
        response = await googleMaps(client, {
          keyword: task.query.text,
          location_coordinate: `${task.point.lat.toFixed(6)},${task.point.lng.toFixed(6)},14z`,
          language_code: universe.language,
          device: universe.device,
          depth: 20,
        });
      } else {
        response = await googleLocalFinder(client, {
          keyword: task.query.text,
          location_coordinate: `${task.point.lat.toFixed(6)},${task.point.lng.toFixed(6)},14z`,
          language_code: universe.language,
          device: universe.device,
          depth: 20,
        });
      }
      const normalized =
        task.surface === "google_maps"
          ? normalizeMapsResult(response, { target, competitors: cohort.business, serpOccupiers: config.serp_occupiers || [] })
          : task.surface === "google_local_finder"
            ? normalizeLocalFinderResult(response, { target, competitors: cohort.business, serpOccupiers: config.serp_occupiers || [] })
            : normalizeLocalPackResult(response, { target, competitors: cohort.business, serpOccupiers: config.serp_occupiers || [] });
      ensureSource(task.surface === "google_local_pack" ? "google-local-pack" : task.surface === "google_maps" ? "google-maps" : "google-local-finder", {
        type: "serp",
        endpoint_family: "serp",
        surface: task.surface,
        location_method: "coordinate",
        language: universe.language,
        device: universe.device,
        field_completeness: 80,
        endpoint:
          task.surface === "google_local_pack"
            ? "/v3/serp/google/organic/live/advanced"
            : task.surface === "google_maps"
              ? "/v3/serp/google/maps/live/advanced"
              : "/v3/serp/google/local_finder/live/advanced",
      });
      return {
        ...base,
        rank: normalized.rank,
        target_found: normalized.target_found,
        target_match: normalized.target_match,
        competitors: normalized.competitors,
        source_id:
          task.surface === "google_local_pack" ? "google-local-pack" : task.surface === "google_maps" ? "google-maps" : "google-local-finder",
        ...(normalized.paid_items ? { paid_items: normalized.paid_items } : {}),
        ...(normalized.notes ? { notes: normalized.notes } : {}),
      };
    } catch (error) {
      return {
        ...base,
        rank: null,
        target_found: false,
        target_match: null,
        competitors: [],
        source_id: task.surface === "google_local_pack" ? "google-local-pack" : task.surface === "google_maps" ? "google-maps" : "google-local-finder",
        not_collected: true,
        notes: `Not collected: ${redactSecrets(error.message).slice(0, 180)}`,
      };
    }
  });

  // Organic visibility.
  const organicQueries = coreQueries.filter((query) => (query.surfaces || []).includes("google_organic"));
  const brandedQueries = config.configuration.branded_diagnostics_enabled
    ? universe.queries.filter((query) => query.brand === "brand")
    : [];
  const organicObservations = await mapLimit([...organicQueries, ...brandedQueries], 4, async (query) => {
    const base = {
      id: `ORG-${query.intent_id}`,
      intent_id: query.intent_id,
      query: query.text,
      collected_at: nowIso,
    };
    try {
      const response = await googleOrganic(client, {
        keyword: query.text,
        location_code: config.market.location_code || config.provider?.location_code || 2840,
        language_code: universe.language,
        device: universe.device,
        depth: 20,
        load_async_ai_overview: false,
      });
      const normalized = normalizeOrganicResult(response, {
        target,
        competitors: cohort.business,
        serpOccupiers: config.serp_occupiers || [],
      });
      ensureSource("google-organic", {
        type: "serp",
        endpoint_family: "serp",
        surface: "google_organic",
        location_method: "location_code",
        language: universe.language,
        device: universe.device,
        field_completeness: 82,
        endpoint: "/v3/serp/google/organic/live/advanced",
      });
      return {
        ...base,
        rank: normalized.rank,
        rank_group: normalized.rank_group,
        rank_absolute: normalized.rank_absolute,
        url: normalized.url,
        domain: normalized.domain,
        serp_features: normalized.serp_features,
        target_found: normalized.target_found,
        target_match: normalized.target_match,
        competitors: normalized.competitors,
        source_id: "google-organic",
        ...(normalized.paid_items ? { paid_items: normalized.paid_items } : {}),
      };
    } catch (error) {
      return {
        ...base,
        rank: null,
        rank_group: null,
        rank_absolute: null,
        url: "",
        domain: "",
        serp_features: [],
        target_found: false,
        target_match: null,
        competitors: [],
        source_id: "google-organic",
        not_collected: true,
        notes: `Not collected: ${redactSecrets(error.message).slice(0, 180)}`,
      };
    }
  });

  // AI visibility. Each prompt is run on its platform surface and every repeat
  // is recorded separately.
  const surfaces = aiSurfaces(config);
  const surfacePlatform = new Map(surfaces.map((surface) => [surface.id, surface]));
  const corePrompts = universe.prompts.filter((prompt) => prompt.role === "core");
  const aiTaskList = [];
  for (const prompt of corePrompts) {
    for (let repeat = 1; repeat <= config.configuration.ai_repeats; repeat += 1) {
      aiTaskList.push({ prompt, repeat });
    }
  }
  const aiObservations = await mapLimit(aiTaskList, 4, async (task) => {
    const platform = task.prompt.platform;
    const surface =
      platform === "google_ai_mode"
        ? surfacePlatform.get("google-ai-mode")
        : platform === "chatgpt"
          ? surfacePlatform.get("chatgpt-llm")
          : null;
    const base = {
      id: `AI-${task.prompt.id}-R${task.repeat}`,
      surface_id: surface?.id || platform,
      platform: surface?.platform || platform,
      product_surface: surface?.product_surface || platform,
      source_type: surface?.source_type || "model_api",
      method: surface?.method || "unknown",
      provider: "dataforseo",
      prompt_id: task.prompt.id,
      intent_id: task.prompt.intent_id,
      prompt: task.prompt.text,
      market: config.market.name,
      language: universe.language,
      collected_at: nowIso,
      repeat: task.repeat,
      model_version: surface?.model_version || "",
    };
    try {
      let normalized;
      if (platform === "google_ai_mode") {
        const response = await googleAiMode(client, {
          keyword: task.prompt.text,
          location_coordinate: `${Number(config.market.center.lat).toFixed(6)},${Number(config.market.center.lng).toFixed(6)},15z`,
          language_code: universe.language,
          device: universe.device,
        });
        normalized = normalizeAiModeResult(response, {
          target,
          competitors: cohort.business,
          serpOccupiers: config.serp_occupiers || [],
        });
        ensureSource("google-ai-mode", {
          type: "ai",
          endpoint_family: "serp",
          surface: "google_ai_mode",
          location_method: "coordinate",
          language: universe.language,
          device: universe.device,
          field_completeness: 70,
          endpoint: "/v3/serp/google/ai_mode/live/advanced",
        });
      } else {
        const response = await llmMentions(client, {
          keyword: task.prompt.text,
          platform: "chat_gpt",
          location_code: config.market.location_code || config.provider?.location_code || 2840,
          language_code: universe.language,
          limit: 10,
        });
        normalized = normalizeLlmMentionsResult(response, {
          target,
          competitors: cohort.business,
          serpOccupiers: config.serp_occupiers || [],
        });
        ensureSource("chatgpt-llm", {
          type: "ai",
          endpoint_family: "ai_optimization",
          surface: "chatgpt",
          location_method: "location_code",
          language: universe.language,
          device: universe.device,
          field_completeness: 65,
          endpoint: "/v3/ai_optimization/llm_mentions/search_mentions/live",
        });
      }
      return {
        ...base,
        target_mentioned: normalized.target_mentioned,
        target_recommended: normalized.target_recommended,
        target_cited: normalized.target_cited,
        target_entity_accuracy: normalized.target_entity_accuracy,
        position: normalized.position,
        cited_domains: normalized.cited_domains,
        competitor_mentions: normalized.competitor_mentions,
        source_id: platform === "google_ai_mode" ? "google-ai-mode" : "chatgpt-llm",
        model_version: normalized.model_version || base.model_version,
        ...(normalized.notes ? { notes: normalized.notes } : {}),
        ...(normalized.available === false ? { notes: `${normalized.notes || "No AI answer was returned."}` } : {}),
      };
    } catch (error) {
      return {
        ...base,
        target_mentioned: false,
        target_recommended: false,
        target_cited: false,
        target_entity_accuracy: "not_present",
        position: null,
        cited_domains: [],
        competitor_mentions: [],
        source_id: platform === "google_ai_mode" ? "google-ai-mode" : "chatgpt-llm",
        not_collected: true,
        notes: `Not collected: ${redactSecrets(error.message).slice(0, 180)}`,
      };
    }
  });
  for (const surface of surfaces) {
    const observed = aiObservations.some((observation) => observation.surface_id === surface.id && !observation.not_collected);
    surface.available = observed;
  }

  // Authority and external entity footprint.
  let authority = { referring_domains: [], listings: [], competitor_referring_domains: [], ai_citation_domains: [] };
  try {
    const summary = await client.request("/v3/backlinks/summary/live", [
      { target: target.domain, include_subdomains: true, exclude_internal_backlinks: true, backlinks_status_type: "live", rank_scale: "one_hundred" },
    ], { taskType: "backlinks_summary" });
    const summaryValue = normalizeBacklinksSummary(summary);
    ensureSource("backlinks", {
      type: "backlinks",
      endpoint_family: "backlinks",
      surface: "backlinks",
      location_method: "not_applicable",
      language: universe.language,
      device: universe.device,
      field_completeness: 75,
      endpoint: "/v3/backlinks/summary/live",
    });
    const referring = await referringDomains(client, { target: target.domain, limit: 100 });
    const referringValues = normalizeReferringDomains(referring, {
      serpOccupiers: config.serp_occupiers || [],
      sourceId: "backlinks",
    });
    const listings = listingsResponse
      ? normalizeBusinessListings(listingsResponse, { target, sourceId: "business-listings" })
      : [];
    const competitorReferring = [];
    for (const competitor of cohort.business) {
      if (!competitor.domain) {
        competitorReferring.push({ competitor_id: competitor.id, relevant_domains: 0 });
        continue;
      }
      try {
        const response = await referringDomains(client, { target: competitor.domain, limit: 50 });
        const values = normalizeReferringDomains(response, { serpOccupiers: config.serp_occupiers || [], sourceId: "backlinks" });
        const relevant = values.filter((value) =>
          ["local", "industry", "manufacturer", "association"].includes(value.type) && ["high", "medium"].includes(value.relevance),
        ).length;
        competitorReferring.push({ competitor_id: competitor.id, relevant_domains: relevant });
      } catch {
        competitorReferring.push({ competitor_id: competitor.id, relevant_domains: 0 });
      }
    }
    authority = {
      referring_domains: referringValues,
      listings,
      competitor_referring_domains: competitorReferring,
      ai_citation_domains: [...new Set(aiObservations.flatMap((observation) => observation.cited_domains || []))].sort(),
    };
  } catch (error) {
    authority = {
      referring_domains: [],
      listings: listingsResponse ? normalizeBusinessListings(listingsResponse, { target, sourceId: "business-listings" }) : [],
      competitor_referring_domains: cohort.business.map((competitor) => ({ competitor_id: competitor.id, relevant_domains: 0 })),
      ai_citation_domains: [...new Set(aiObservations.flatMap((observation) => observation.cited_domains || []))].sort(),
    };
  }

  const validity = {
    provider_error_rate: client.errors.length / Math.max(plan.total_task_count, 1),
    critical_source_outage: false,
    planned: { core_queries: 0, maps_observations: 0, organic_observations: 0, ai_prompt_runs: 0 },
    collected: { core_queries: 0, maps_observations: 0, organic_observations: 0, ai_prompt_runs: 0 },
    notes: [demandNote].filter(Boolean),
  };
  const audit = {
    schema_version: "1.0",
    audit_mode: "public",
    run: {
      run_id: RUN_ID,
      started_at: startedAt,
      finished_at: nowIso,
      collector_version: COLLECTOR_VERSION,
      rubric_version: RUBRIC.version,
      source_mode: "live",
      synthetic: false,
      query_universe_hash: universe.hash,
    },
    business,
    market: {
      name: config.market.name,
      region: config.market.region || "",
      country: config.market.country || "US",
      language: universe.language,
      device: universe.device,
      center: config.market.center,
      radius_km: config.market.radius_km,
      grid_id: grid.id,
      query_universe_id: universe.universe_id,
    },
    configuration: config.configuration,
    query_universe: universe,
    sources: [...sources.values()],
    validity,
    maps: { grid, surfaces: [...new Set(mapsTaskList.map((task) => task.surface))], observations: mapsObservations },
    organic: { observations: organicObservations },
    ai: { surfaces, observations: aiObservations },
    competitors: cohort,
    authority,
    resilience: { history: [], notes: "No comparable prior run supplied." },
    metrics: {},
    facts: {},
    checks: {},
    limitations: [
      "Public Mode observes discovery only. GBP and Website Scorecards diagnose profile trust and website conversion.",
      "AI answers vary; each repeat is recorded separately and aggregated with the documented majority rule.",
      "Local Pack, Google Maps, and Local Finder are recorded as separate surfaces.",
      "Authority relevance is classified heuristically; LV-AUT-02 is review-only.",
      "Paid visibility is diagnostic and unscored.",
      "No credentials, authorization headers, cookies, or raw provider payloads are stored in this artifact.",
    ],
    review: {
      status: "pending",
      notes: [
        "Deterministic checks are derived from normalized observations; judgment checks remain for review.",
        `Provider-reported task cost: $${client.costUsd.toFixed(4)}. Account spending is local and never published.`,
        ...(demandNote ? [demandNote] : []),
        "Review the judgment checks, then score.",
      ],
    },
  };

  const derived = deriveAudit(audit, RUBRIC);
  audit.metrics = derived.metrics;
  audit.facts = derived.facts;
  audit.checks = derived.checks;
  audit.validity.planned = derived.validity.counts.planned;
  audit.validity.collected = derived.validity.counts.collected;
  audit.validity.gates = derived.validity.gates;
  audit.facts.sufficient_valid_evidence = derived.validity.passed;

  const planRecord = {
    ...plan,
    actual: {
      provider_task_count: client.taskCount,
      provider_reported_cost_usd: client.costUsd,
      provider_errors: client.errors.length,
    },
  };
  return { audit, universe, plan: planRecord, sourceMode: "live", synthetic: false };
}

/* ------------------------------------------------------------------ */
/* Write                                                               */
/* ------------------------------------------------------------------ */

async function main() {
  const collected = fixturePath ? fixtureCollect() : await liveCollect();
  const { audit, universe, plan, sourceMode, synthetic } = collected;
  if (!fixturePath) {
    const derived = deriveAudit(audit, RUBRIC);
    audit.metrics = derived.metrics;
    audit.facts = derived.facts;
    audit.checks = derived.checks;
    audit.validity.planned = derived.validity.counts.planned;
    audit.validity.collected = derived.validity.counts.collected;
    audit.validity.gates = derived.validity.gates;
    audit.facts.sufficient_valid_evidence = derived.validity.passed;
  } else {
    const derived = deriveAudit(audit, RUBRIC);
    audit.metrics = derived.metrics;
    audit.facts = derived.facts;
    audit.checks = derived.checks;
    audit.validity.planned = derived.validity.counts.planned;
    audit.validity.collected = derived.validity.counts.collected;
    audit.validity.gates = derived.validity.gates;
    audit.facts.sufficient_valid_evidence = derived.validity.passed;
  }
  const slug = slugFrom(audit.business.name || audit.business.domain || "business");
  const outArg = arg("out", path.join(".audit", slug, RUN_ID));
  if (outArg === true) {
    console.error("error: --out requires a path");
    process.exit(2);
  }
  const out = path.resolve(outArg);
  fs.mkdirSync(out, { recursive: true });

  const run = {
    run_id: RUN_ID,
    schema_version: "1.0",
    audit_mode: "public",
    source_mode: sourceMode,
    synthetic,
    collector_version: COLLECTOR_VERSION,
    rubric_version: RUBRIC.version,
    started_at: audit.run.started_at,
    finished_at: audit.run.finished_at,
    business: audit.business,
    query_universe_hash: universe.hash,
    sources: audit.sources.map((entry) => ({ id: entry.id, type: entry.type, field_completeness: entry.field_completeness })),
    non_destructive: true,
    review_required: true,
  };

  fs.writeFileSync(path.join(out, "query-universe.json"), JSON.stringify(universe, null, 2) + "\n", "utf8");
  fs.writeFileSync(path.join(out, "audit.json"), JSON.stringify(audit, null, 2) + "\n", "utf8");
  fs.writeFileSync(path.join(out, "run.json"), JSON.stringify(run, null, 2) + "\n", "utf8");
  fs.writeFileSync(path.join(out, "metrics.json"), JSON.stringify(audit.metrics, null, 2) + "\n", "utf8");
  if (plan) fs.writeFileSync(path.join(out, "plan.json"), JSON.stringify(plan, null, 2) + "\n", "utf8");

  console.log(`wrote ${path.join(out, "audit.json")}`);
  console.log(`wrote ${path.join(out, "query-universe.json")}`);
  console.log(`wrote ${path.join(out, "run.json")}`);
  console.log(`wrote ${path.join(out, "metrics.json")}`);
  if (plan) console.log(`wrote ${path.join(out, "plan.json")}`);
  console.log(
    sourceMode === "fixture"
      ? "fixture mode: no network, no credentials, deterministic checks pre-filled, judgment checks pending"
      : "live public mode: DataForSEO observations collected, deterministic checks pre-filled, judgment checks pending",
  );
  if (!audit.validity.gates?.every((gate) => gate.passed)) {
    console.error("warning: a validity gate failed. score.py will refuse to write a score until the run has sufficient valid evidence.");
    for (const gate of audit.validity.gates || []) {
      if (!gate.passed) console.error(`  gate ${gate.id}: ${gate.detail}`);
    }
  }
  console.log("Next: review the judgment checks, then run score.py --input audit.filled.json --out scores.json --strict.");
}

main().catch((error) => {
  console.error(`error: ${redactSecrets(error.message)}`);
  process.exit(1);
});
