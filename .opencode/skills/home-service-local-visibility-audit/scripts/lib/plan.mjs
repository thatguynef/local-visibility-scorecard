/**
 * Cost and task planning for a live audit.
 *
 * The planner never sends a paid request. It reports task counts and, only when
 * a local pricing file supplies real contracted prices, a cost estimate. If a
 * reliable price is unavailable it says so rather than inventing one.
 */

const round = (value, places = 2) => Math.round((Number(value) + Number.EPSILON) * 10 ** places) / 10 ** places;

const requiredPriceKeys = {
  localPack: "serp_google_organic",
  maps: "serp_google_maps",
  localFinder: "serp_google_local_finder",
  organic: "serp_google_organic",
  aiMode: "serp_google_ai_mode",
  llmMentions: "llm_mentions",
  keywordOverview: "labs_keyword_overview",
  backlinksSummary: "backlinks_summary",
  referringDomains: "backlinks_referring_domains",
  businessListings: "business_listings_search",
};

export function validatePricing(pricing) {
  if (!pricing || typeof pricing !== "object") throw new Error("pricing must be a JSON object");
  if (pricing.schema_version !== "1.0") throw new Error("pricing schema_version must be 1.0");
  if (!pricing.tasks || typeof pricing.tasks !== "object") throw new Error("pricing.tasks must be an object");
  return pricing;
}

export function estimateCost(plan, pricing) {
  if (!pricing) {
    return {
      available: false,
      reason: "No local pricing file supplied. The tool will not invent a provider price; use --pricing to enforce --max-cost-usd.",
      total_usd: null,
      by_task: {},
    };
  }
  const tasks = pricing.tasks || {};
  const byTask = {};
  const add = (key, quantity) => {
    if (!quantity) return;
    const price = tasks[key];
    if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
      byTask[key] = { quantity, unit_usd: null, subtotal_usd: null };
      return;
    }
    byTask[key] = { quantity, unit_usd: price, subtotal_usd: round(quantity * price) };
  };
  add(requiredPriceKeys.localPack, plan.local_pack_tasks);
  add(requiredPriceKeys.maps, plan.maps_tasks);
  add(requiredPriceKeys.localFinder, plan.local_finder_tasks);
  add(requiredPriceKeys.organic, plan.organic_tasks);
  add(requiredPriceKeys.aiMode, plan.ai_mode_tasks);
  add(requiredPriceKeys.llmMentions, plan.llm_mentions_tasks);
  add(requiredPriceKeys.keywordOverview, plan.keyword_overview_tasks);
  add(requiredPriceKeys.backlinksSummary, plan.backlinks_summary_tasks);
  add(requiredPriceKeys.referringDomains, plan.referring_domains_tasks);
  add(requiredPriceKeys.businessListings, plan.business_listings_tasks);
  const missing = Object.entries(byTask).filter(([, value]) => value.unit_usd === null);
  if (missing.length) {
    return {
      available: false,
      reason: `Pricing is missing for: ${missing.map(([key]) => key).join(", ")}. No cost estimate was invented.`,
      total_usd: null,
      by_task: byTask,
    };
  }
  const total = Object.values(byTask).reduce((sum, value) => sum + (value.subtotal_usd || 0), 0);
  return {
    available: true,
    reason: "Estimated from the local pricing file. Actual provider cost is recorded by the client.",
    total_usd: round(total),
    by_task: byTask,
  };
}

export function buildPlan({ universe, grid, configuration = {}, pricing = null, limits = {}, competitorCount = 0, includeDemandTask = true }) {
  const coreQueries = universe.queries.filter((query) => query.role === "core" && query.brand === "non_brand");
  const gridQueries = coreQueries.filter((query) => query.grid === true);
  const organicQueries = coreQueries.filter((query) => (query.surfaces || []).includes("google_organic"));
  const brandedQueries = universe.queries.filter((query) => query.brand === "brand");
  const corePrompts = universe.prompts.filter((prompt) => prompt.role === "core");
  const aiModePrompts = corePrompts.filter((prompt) => prompt.platform === "google_ai_mode");
  const llmPrompts = corePrompts.filter((prompt) => prompt.platform === "chatgpt");
  const repeats = Number(configuration.ai_repeats) || 3;
  const mapsSurfaces = ["google_local_pack", "google_maps"];
  if (configuration.local_finder_configured) mapsSurfaces.push("google_local_finder");
  const points = grid.points;
  const localPackTasks = gridQueries.length * points;
  const mapsTasks = gridQueries.length * points;
  const localFinderTasks = configuration.local_finder_configured ? gridQueries.length * points : 0;
  const organicTasks = organicQueries.length + (configuration.branded_diagnostics_enabled ? brandedQueries.length : 0);
  const aiModeTasks = aiModePrompts.length * repeats;
  const llmMentionsTasks = llmPrompts.length * repeats;
  const competitorTasks = Math.max(0, Number(competitorCount) || 0);
  const backlinksSummaryTasks = 1 + competitorTasks;
  const referringDomainsTasks = 1;
  const businessListingsTasks = 1;
  const keywordOverviewTasks = includeDemandTask ? 1 : 0;
  const serpTasks = localPackTasks + mapsTasks + localFinderTasks + organicTasks;
  const aiTasks = aiModeTasks + llmMentionsTasks;
  const authorityTasks = backlinksSummaryTasks + referringDomainsTasks + businessListingsTasks;
  const totalTasks = serpTasks + aiTasks + authorityTasks + keywordOverviewTasks;
  const plan = {
    generated_at: new Date().toISOString(),
    universe_id: universe.universe_id,
    universe_hash: universe.hash,
    grid_id: grid.id,
    grid_hash: grid.hash,
    grid_size: grid.size,
    grid_points: grid.points,
    core_keywords: coreQueries.length,
    core_queries: coreQueries.length,
    grid_queries: gridQueries.length,
    organic_queries: organicQueries.length,
    branded_diagnostic_queries: brandedQueries.length,
    ai_prompts: corePrompts.length,
    ai_repeats: repeats,
    competitor_count: competitorTasks,
    maps_surfaces: mapsSurfaces,
    local_pack_tasks: localPackTasks,
    maps_tasks: mapsTasks,
    local_finder_tasks: localFinderTasks,
    organic_tasks: organicTasks,
    ai_mode_tasks: aiModeTasks,
    llm_mentions_tasks: llmMentionsTasks,
    ai_prompt_tasks: aiTasks,
    competitor_tasks: competitorTasks,
    authority_tasks: authorityTasks,
    backlinks_summary_tasks: backlinksSummaryTasks,
    referring_domains_tasks: referringDomainsTasks,
    business_listings_tasks: businessListingsTasks,
    keyword_overview_tasks: keywordOverviewTasks,
    serp_task_count: serpTasks,
    ai_task_count: aiTasks,
    total_task_count: totalTasks,
    limits: {
      max_serp_tasks: Number(limits.maxSerpTasks) || 5000,
      max_ai_tasks: Number(limits.maxAiTasks) || 250,
      max_cost_usd: limits.maxCostUsd === null || limits.maxCostUsd === undefined ? null : Number(limits.maxCostUsd),
      max_queries: Number(limits.maxQueries) || 40,
    },
  };
  plan.cost = estimateCost(plan, pricing);
  plan.exceeds = {
    serp_tasks: plan.serp_task_count > plan.limits.max_serp_tasks,
    ai_tasks: plan.ai_task_count > plan.limits.max_ai_tasks,
    cost: plan.cost.available && plan.limits.max_cost_usd !== null ? plan.cost.total_usd > plan.limits.max_cost_usd : false,
    queries: plan.core_queries > plan.limits.max_queries,
  };
  plan.over_budget = Object.values(plan.exceeds).some(Boolean);
  return plan;
}

export function formatPlan(plan) {
  const lines = [
    "Local Visibility Scorecard — dry-run plan",
    "",
    `Universe:        ${plan.universe_id} (${plan.universe_hash})`,
    `Grid:            ${plan.grid_size}x${plan.grid_size} / ${plan.grid_points} points (${plan.grid_hash})`,
    `Core keywords:   ${plan.core_keywords}`,
    `Grid queries:    ${plan.grid_queries}`,
    `AI prompts:      ${plan.ai_prompts} x ${plan.ai_repeats} repeats`,
    `Competitors:     ${plan.competitor_count} business competitors in the locked cohort`,
    "",
    "Task counts",
    `  Local Pack     ${plan.local_pack_tasks}`,
    `  Maps           ${plan.maps_tasks}`,
    `  Local Finder   ${plan.local_finder_tasks}`,
    `  Organic        ${plan.organic_tasks}`,
    `  AI Mode        ${plan.ai_mode_tasks}`,
    `  LLM mentions   ${plan.llm_mentions_tasks}`,
    `  Authority      ${plan.authority_tasks}`,
    `  Keyword data   ${plan.keyword_overview_tasks}`,
    `  SERP total     ${plan.serp_task_count}`,
    `  AI total       ${plan.ai_task_count}`,
    `  All tasks      ${plan.total_task_count}`,
    "",
    "Safety ceilings",
    `  SERP tasks     ${plan.limits.max_serp_tasks}`,
    `  AI tasks       ${plan.limits.max_ai_tasks}`,
    `  Cost ceiling   ${plan.limits.max_cost_usd === null ? "not configured" : `$${plan.limits.max_cost_usd.toFixed(2)}`}`,
    `  Cost estimate  ${plan.cost.available ? `$${plan.cost.total_usd.toFixed(2)}` : "unavailable"}`,
  ];
  if (!plan.cost.available) lines.push(`                 ${plan.cost.reason}`);
  if (plan.over_budget) {
    lines.push("", "This plan exceeds at least one configured ceiling. It will not run without explicit opt-in.");
  } else {
    lines.push("", "This plan is within the configured ceilings. No paid request has been sent.");
  }
  return lines.join("\n");
}
