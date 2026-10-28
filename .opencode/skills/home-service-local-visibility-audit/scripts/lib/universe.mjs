/**
 * Canonical query-universe builder and hash.
 *
 * The universe is built from the market configuration before any ranking is
 * collected. It is deterministic: the same configuration produces the same
 * services, intents, queries, prompts, weights, and hash.
 *
 * The hash excludes volatile review metadata (created_at, locked_at, review)
 * so a reviewer can re-approve a universe without invalidating a score.
 */

import crypto from "node:crypto";

export const UNIVERSE_SCHEMA_VERSION = "1.0";
export const UNIVERSE_VERSION = "1.0.0";
export const BUILDER_VERSION = "1.0.0";

const slug = (value) =>
  String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "ITEM";

export const serviceKey = (value) => slug(value);

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Distribute one cluster's weight across intents without letting a single head
 * term exceed `cap` of the cluster. Water-filling is used so the cap is a real
 * constraint, not a cosmetic clamp followed by renormalization.
 */
export function boundedShares(rawWeights, cap = 0.5) {
  const values = rawWeights.map((value) => Math.max(Number(value) || 0, 0.000001));
  const result = new Array(values.length).fill(0);
  if (!values.length) return result;
  if (values.length === 1) {
    result[0] = 1;
    return result;
  }
  let remaining = 1;
  let active = values.map((value, index) => ({ index, value }));
  while (active.length) {
    const total = active.reduce((sum, entry) => sum + entry.value, 0);
    const shares = active.map((entry) => ({ ...entry, share: (remaining * entry.value) / total }));
    const over = shares.filter((entry) => entry.share > cap + 1e-9);
    if (!over.length) {
      for (const entry of shares) result[entry.index] = entry.share;
      break;
    }
    for (const entry of over) {
      result[entry.index] = cap;
      remaining -= cap;
      if (remaining < 0) remaining = 0;
    }
    const overIndices = new Set(over.map((entry) => entry.index));
    active = active.filter((entry) => !overIndices.has(entry.index));
    if (!active.length) break;
  }
  const total = result.reduce((sum, value) => sum + value, 0);
  return total > 0 ? result.map((value) => value / total) : result;
}

const marketShortName = (market) => String(market || "").split(",")[0].trim();

const commercialClasses = new Set(["service", "emergency", "near_me", "city_modified", "high_ticket"]);

export function isCommercialIntent(intent) {
  return commercialClasses.has(intent.class);
}

export function buildUniverse(config, options = {}) {
  if (!config || typeof config !== "object") throw new Error("market configuration is required");
  if (!config.business?.trade) throw new Error("configuration.business.trade is required");
  if (!config.market?.name) throw new Error("configuration.market.name is required");
  if (!Array.isArray(config.services) || !config.services.length) throw new Error("configuration.services must be a non-empty array");
  const platformList = Array.isArray(config.ai_platforms) && config.ai_platforms.length
    ? config.ai_platforms
    : ["google_ai_mode"];
  const repeats = Number(config.configuration?.ai_repeats) || 3;
  const market = config.market;
  const trade = config.business.trade;
  const shortMarket = marketShortName(market.name);
  const createdAt = options.createdAt || config.created_at || "2026-01-01T00:00:00Z";
  const lockedAt = options.lockedAt || createdAt;
  const defaultDemandSource = options.demandSource || config.demand_source || "synthetic_fixture";

  const services = config.services.map((service) => ({
    id: service.id || slug(service.label),
    label: service.label,
    priority: service.priority || "primary",
    symptoms: Array.isArray(service.symptoms) ? service.symptoms.slice(0, 4) : [],
    demand: {
      volume: Number(service.demand?.volume) || 0,
      cpc: Number(service.demand?.cpc) || 0,
      trend: Number(service.demand?.trend) || 0,
      ...(service.demand?.source ? { source: String(service.demand.source) } : {}),
    },
  }));

  const serviceIds = new Set();
  for (const service of services) {
    if (!service.label) throw new Error("every service needs a label");
    if (serviceIds.has(service.id)) throw new Error(`duplicate service id: ${service.id}`);
    serviceIds.add(service.id);
  }

  const intents = [];
  const queries = [];
  const prompts = [];

  const addIntent = (intent) => {
    intents.push(intent);
    return intent;
  };
  const addQuery = (intent, text, surfaces) => {
    const grid = intent.core && ["category", "service", "emergency"].includes(intent.class);
    queries.push({
      id: `Q-${intent.id}`,
      intent_id: intent.id,
      service_id: intent.service_id,
      text,
      intent_class: intent.class,
      brand: intent.brand,
      role: intent.core ? "core" : "diagnostic",
      demand: { ...intent.demand },
      weight: intent.weight,
      surfaces,
      grid,
    });
  };

  const configuration = config.configuration || {};
  const includeNearMe = configuration.near_me_demand !== false;
  const includeCity = configuration.city_modified_demand !== false;
  const includeEmergency = configuration.emergency_service !== false;

  for (const service of services) {
    const base = { service_id: service.id, brand: "non_brand", core: true, demand: { ...service.demand, source: service.demand.source || options.demandSource || defaultDemandSource }, weight: 0 };
    const serviceIntent = addIntent({
      ...base,
      id: `INT-${service.id}-SERVICE`,
      class: "service",
      label: service.label,
    });
    // A disabled condition removes the intent and its queries before the
    // universe is hashed. It is not scored as N/A while still influencing the
    // demand-weighted visibility metrics.
    const nearMeIntent = includeNearMe
      ? addIntent({
          ...base,
          id: `INT-${service.id}-NEAR_ME`,
          class: "near_me",
          label: `${service.label} near me`,
        })
      : null;
    const cityIntent = includeCity
      ? addIntent({
          ...base,
          id: `INT-${service.id}-CITY`,
          class: "city_modified",
          label: `${service.label} ${shortMarket}`,
        })
      : null;
    const problemIntent = addIntent({
      ...base,
      id: `INT-${service.id}-PROBLEM`,
      class: "problem_symptom",
      label: service.symptoms[0] ? `${service.symptoms[0]} repair` : `${service.label} problem`,
    });
    addQuery(serviceIntent, service.label, ["google_local_pack", "google_maps", "google_organic"]);
    if (nearMeIntent) addQuery(nearMeIntent, `${service.label} near me`, ["google_local_pack", "google_maps", "google_organic"]);
    if (cityIntent) addQuery(cityIntent, `${service.label} ${shortMarket}`, ["google_local_pack", "google_maps", "google_organic"]);
    addQuery(problemIntent, service.symptoms[0] ? `${service.symptoms[0]} repair` : `${service.label} repair`, ["google_maps", "google_organic"]);

    if (service.priority === "primary") {
      const highTicket = addIntent({
        ...base,
        id: `INT-${service.id}-HIGH_TICKET`,
        class: "high_ticket",
        label: `${service.label} contractor`,
      });
      addQuery(highTicket, `${service.label} contractor`, ["google_maps", "google_organic"]);
    }
  }

  // One emergency intent. It belongs to the service that already expresses
  // urgency, or to the first primary service when no emergency service is named.
  if (includeEmergency) {
    const emergencyService =
      services.find((service) => /emergency/i.test(service.id) || /emergency/i.test(service.label)) ||
      services.find((service) => service.priority === "primary") ||
      services[0];
    const emergencyIntent = addIntent({
      id: `INT-${emergencyService.id}-EMERGENCY`,
      service_id: emergencyService.id,
      class: "emergency",
      label: `emergency ${trade}`,
      brand: "non_brand",
      core: true,
      demand: { volume: Math.round((emergencyService.demand.volume || 0) * 0.6), cpc: emergencyService.demand.cpc, trend: emergencyService.demand.trend, source: emergencyService.demand.source || options.demandSource || defaultDemandSource },
      weight: 0,
    });
    addQuery(emergencyIntent, `emergency ${trade}`, ["google_local_pack", "google_maps", "google_organic"]);
  }

  // Category intent.
  const categoryService = services.find((service) => service.id === "general_plumbing") || services[0];
  const categoryIntent = addIntent({
    id: `INT-${categoryService.id}-CATEGORY`,
    service_id: categoryService.id,
    class: "category",
    label: trade,
    brand: "non_brand",
    core: true,
    demand: { volume: Math.round((categoryService.demand.volume || 0) * 1.2), cpc: categoryService.demand.cpc, trend: categoryService.demand.trend, source: categoryService.demand.source || options.demandSource || defaultDemandSource },
    weight: 0,
  });
  addQuery(categoryIntent, trade, ["google_local_pack", "google_maps", "google_organic"]);

  // Branded diagnostic queries.
  const branded = Array.isArray(config.branded_queries) && config.branded_queries.length
    ? config.branded_queries
    : [config.business.name, `${config.business.name} reviews`];
  for (const [index, text] of branded.entries()) {
    const intent = addIntent({
      id: `INT-BRAND-${index + 1}`,
      service_id: categoryService.id,
      class: "category",
      label: text,
      brand: "brand",
      core: false,
      demand: { volume: 0, cpc: 0, trend: 0, source: options.demandSource || defaultDemandSource },
      weight: 0,
    });
    addQuery(intent, text, ["google_organic"]);
  }

  // Weights: equal cluster weight, bounded within-cluster demand weighting.
  const coreIntents = intents.filter((intent) => intent.core && intent.brand === "non_brand");
  const clusters = services
    .map((service) => ({ service, intents: coreIntents.filter((intent) => intent.service_id === service.id) }))
    .filter((cluster) => cluster.intents.length > 0);
  const clusterWeight = clusters.length ? 1 / clusters.length : 0;
  for (const cluster of clusters) {
    const shares = boundedShares(
      cluster.intents.map((intent) => Math.sqrt(Math.max(intent.demand.volume || 0, 1))),
      0.5,
    );
    cluster.intents.forEach((intent, index) => {
      intent.weight = Number((clusterWeight * shares[index]).toFixed(6));
    });
  }
  for (const query of queries) {
    const intent = intents.find((entry) => entry.id === query.intent_id);
    query.weight = intent?.weight || 0;
  }

  // AI prompts derive from the same intent model, never from a separate GEO list.
  // The V1 prompt set is deliberately bounded: category, service, and emergency.
  const aiClasses = new Set(["category", "service", "emergency"]);
  const aiIntents = coreIntents.filter((intent) => aiClasses.has(intent.class));
  for (const intent of aiIntents) {
    for (const platform of platformList) {
      prompts.push({
        id: `P-${intent.id}-${slug(platform)}`,
        intent_id: intent.id,
        service_id: intent.service_id,
        template_id: `TPL-${intent.class.toUpperCase()}-V1`,
        text: aiPromptFor(intent, market.name, trade),
        platform,
        language: market.language || "en",
        repeat_default: repeats,
        role: "core",
      });
    }
  }

  const coreQueries = queries.filter((query) => query.role === "core");
  const corePrompts = prompts.filter((prompt) => prompt.role === "core");
  const universe = {
    schema_version: UNIVERSE_SCHEMA_VERSION,
    universe_id: `${slug(config.business.name || trade)}-${slug(shortMarket)}-V1`,
    universe_version: UNIVERSE_VERSION,
    trade,
    market: {
      name: market.name,
      region: market.region || "",
      country: market.country || "US",
      language: market.language || "en",
      device: market.device || "mobile",
      center: market.center,
      radius_km: Number(market.radius_km) || 10,
    },
    language: market.language || "en",
    device: market.device || "mobile",
    created_at: createdAt,
    locked_at: lockedAt,
    locked: true,
    generation_method: "deterministic_service_intent_templates_v1",
    review: {
      status: "approved",
      reviewed_at: lockedAt,
      reviewer: options.reviewer || "synthetic-fixture",
    },
    hash: "",
    services,
    intents,
    queries,
    prompts,
    demand_model: {
      formula: "cluster_weight = 1 / core_service_clusters; within-cluster share is proportional to sqrt(max(search_volume,1)), water-filled so no intent exceeds 50% of its cluster; query weight equals its intent weight.",
      service_cluster_weighting: "equal_cluster_weight",
      demand_signal: "search_volume_sqrt_bounded",
    },
    quality_gates: {
      non_branded_core_share: Number((coreIntents.length / Math.max(intents.length, 1)).toFixed(4)),
      min_services: 3,
      min_core_queries: 12,
      min_core_prompts: 4,
    },
  };
  if (coreQueries.length < universe.quality_gates.min_core_queries) {
    throw new Error(`query universe has ${coreQueries.length} core queries; at least ${universe.quality_gates.min_core_queries} required`);
  }
  if (corePrompts.length < universe.quality_gates.min_core_prompts) {
    throw new Error(`query universe has ${corePrompts.length} core prompts; at least ${universe.quality_gates.min_core_prompts} required`);
  }
  universe.hash = hashUniverse(universe);
  return universe;
}

function aiPromptFor(intent, marketName, trade) {
  const place = marketShortName(marketName);
  switch (intent.class) {
    case "category":
      return `Which ${trade} companies should I consider in ${place}?`;
    case "service":
      return `Who provides ${intent.label} in ${place}?`;
    case "emergency":
      return `Who can help with an emergency ${trade} problem in ${place} today?`;
    case "problem_symptom":
      return `What local company should I call for ${intent.label} in ${place}?`;
    case "high_ticket":
      return `Which ${trade} contractor in ${place} handles ${intent.label.replace(/ contractor$/, "")}?`;
    case "city_modified":
      return `Who is the best ${intent.label.replace(place, "").trim()} company in ${place}?`;
    default:
      return `Which local ${trade} business should I hire in ${place} for ${intent.label}?`;
  }
}

export function hashUniverse(universe) {
  const payload = {
    schema_version: universe.schema_version,
    universe_id: universe.universe_id,
    universe_version: universe.universe_version,
    trade: universe.trade,
    market: universe.market,
    language: universe.language,
    device: universe.device,
    generation_method: universe.generation_method,
    services: universe.services,
    intents: universe.intents,
    queries: universe.queries,
    prompts: universe.prompts,
    demand_model: universe.demand_model,
    quality_gates: universe.quality_gates,
  };
  return `sha256:${crypto.createHash("sha256").update(canonicalJson(payload)).digest("hex")}`;
}

export function universeFingerprint(universe) {
  return hashUniverse(universe);
}
