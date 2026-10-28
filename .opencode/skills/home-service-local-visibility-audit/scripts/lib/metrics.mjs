/**
 * Deterministic visibility metrics and check derivation.
 *
 * This module is used by the collector (to pre-fill deterministic checks) and
 * by the verifier (to independently recompute the same metrics). It performs no
 * network access and no model call.
 *
 * The package is intentionally explicit about weighting:
 * - each core service cluster receives equal cluster weight;
 * - within a cluster, intent weight is proportional to sqrt(search volume),
 *   water-filled so one intent never exceeds 50% of its cluster;
 * - Local Pack, Maps, Local Finder, organic, and AI are never pooled into a
 *   single rank.
 */

import { boundedShares } from "./universe.mjs";

export const METRICS_VERSION = "1.0.0";

const SURFACE_LABELS = {
  google_local_pack: "Local Pack",
  google_maps: "Google Maps",
  google_local_finder: "Local Finder",
  google_organic: "Google organic",
};

const round = (value, places = 4) => {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const factor = 10 ** places;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
};

const mean = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);
const sum = (values) => values.reduce((total, value) => total + value, 0);

const median = (values) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const hhi = (shares) => {
  const total = sum(shares);
  if (!total) return 1;
  return sum(shares.map((value) => (value / total) ** 2));
};

const rankCredit = (rank) => {
  if (!rank) return 0;
  if (rank <= 3) return 1;
  if (rank <= 10) return 0.7;
  if (rank <= 20) return 0.3;
  return 0;
};

const labelFor = (value) => {
  if (value === null || value === undefined) return "N/A";
  if (value >= 0.6) return "Strong";
  if (value >= 0.3) return "Partial";
  if (value > 0) return "Weak";
  return "Absent";
};

const toMap = (rows, key) => {
  const map = new Map();
  for (const row of rows) {
    const value = row[key];
    if (!map.has(value)) map.set(value, []);
    map.get(value).push(row);
  }
  return map;
};

function weightedAverage(rows, weightOf, valueOf) {
  let weightSum = 0;
  let valueSum = 0;
  for (const row of rows) {
    const value = valueOf(row);
    if (value === null || value === undefined || Number.isNaN(value)) continue;
    const weight = weightOf(row);
    if (!weight) continue;
    weightSum += weight;
    valueSum += weight * value;
  }
  return weightSum ? valueSum / weightSum : null;
}

function coreIntentsOf(audit) {
  return (audit.query_universe?.intents || []).filter((intent) => intent.core && intent.brand === "non_brand");
}

function coreQueriesOf(audit) {
  return (audit.query_universe?.queries || []).filter((query) => query.role === "core" && query.brand === "non_brand");
}

function gridQueriesOf(audit) {
  return coreQueriesOf(audit).filter((query) => query.grid === true);
}

function mapPoints(audit) {
  const points = new Map();
  for (const observation of audit.maps?.observations || []) {
    if (observation.not_collected) continue;
    if (!points.has(observation.point_id)) {
      points.set(observation.point_id, { lat: observation.lat, lng: observation.lng });
    }
  }
  return points;
}

function quadrantOf(point, center) {
  const north = Number(point.lat) >= Number(center.lat);
  const east = Number(point.lng) >= Number(center.lng);
  if (north && east) return "NE";
  if (north && !east) return "NW";
  if (!north && east) return "SE";
  return "SW";
}

function businessCompetitorIds(audit) {
  return new Set((audit.competitors?.business || []).map((competitor) => competitor.id));
}

function bestRank(observations, predicate = () => true) {
  const ranks = observations
    .filter((observation) => !observation.not_collected && predicate(observation))
    .filter((observation) => observation.target_found && Number.isInteger(observation.rank) && observation.rank > 0)
    .map((observation) => observation.rank);
  return ranks.length ? Math.min(...ranks) : null;
}

function buildAiPairs(audit) {
  const groups = new Map();
  for (const observation of audit.ai?.observations || []) {
    if (observation.not_collected) continue;
    const key = `${observation.surface_id}::${observation.prompt_id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        surface_id: observation.surface_id,
        prompt_id: observation.prompt_id,
        intent_id: observation.intent_id,
        source_type: observation.source_type,
        observations: [],
      });
    }
    groups.get(key).observations.push(observation);
  }
  const pairs = [];
  for (const group of groups.values()) {
    const count = group.observations.length;
    const threshold = Math.ceil(count / 2);
    const atLeast = (field) => group.observations.filter((observation) => observation[field] === true).length >= threshold;
    const competitorCounts = new Map();
    for (const observation of group.observations) {
      for (const competitor of observation.competitor_mentions || []) {
        if (competitor.recommended !== true) continue;
        competitorCounts.set(competitor.id, (competitorCounts.get(competitor.id) || 0) + 1);
      }
    }
    const competitorRecommended = new Map(
      [...competitorCounts.entries()].filter(([, value]) => value >= threshold),
    );
    pairs.push({
      ...group,
      repeats: count,
      mentioned: atLeast("target_mentioned"),
      recommended: atLeast("target_recommended"),
      cited: atLeast("target_cited"),
      stable_mention: new Set(group.observations.map((observation) => observation.target_mentioned)).size === 1,
      cited_domains: [...new Set(group.observations.flatMap((observation) => observation.cited_domains || []))],
      competitor_recommended: competitorRecommended,
    });
  }
  return pairs;
}

function aiStats(audit, intents) {
  const pairs = buildAiPairs(audit);
  const validatedSurfaces = (audit.ai?.surfaces || []).filter((surface) => surface.validated && surface.available);
  const validatedIds = new Set(validatedSurfaces.map((surface) => surface.id));
  const pairsOnValidated = pairs.filter((pair) => validatedIds.has(pair.surface_id));
  const byIntent = toMap(pairsOnValidated, "intent_id");
  const bySurface = toMap(pairsOnValidated, "surface_id");
  const aiIntents = intents.filter((intent) => pairsOnValidated.some((pair) => pair.intent_id === intent.id));

  const intentRows = aiIntents.map((intent) => {
    const intentPairs = byIntent.get(intent.id) || [];
    return {
      intent,
      weight: intent.weight,
      mention: mean(intentPairs.map((pair) => (pair.mentioned ? 1 : 0))),
      recommendation: mean(intentPairs.map((pair) => (pair.recommended ? 1 : 0))),
      citation: mean(intentPairs.map((pair) => (pair.cited ? 1 : 0))),
      any: intentPairs.some((pair) => pair.mentioned || pair.recommended),
    };
  });

  const mentionCoverage = weightedAverage(intentRows, (row) => row.weight, (row) => row.mention);
  const recommendationCoverage = weightedAverage(intentRows, (row) => row.weight, (row) => row.recommendation);
  const citationCoverage = weightedAverage(intentRows, (row) => row.weight, (row) => row.citation);
  const promptIntentCoverage = intentRows.length
    ? intentRows.filter((row) => row.any).length / intentRows.length
    : 0;

  const surfaceRows = validatedSurfaces.map((surface) => {
    const surfacePairs = bySurface.get(surface.id) || [];
    return {
      id: surface.id,
      platform: surface.platform,
      product_surface: surface.product_surface,
      source_type: surface.source_type,
      model_version: surface.model_version || "",
      pairs: surfacePairs.length,
      mention: surfacePairs.length ? surfacePairs.filter((pair) => pair.mentioned).length / surfacePairs.length : null,
      recommendation: surfacePairs.length ? surfacePairs.filter((pair) => pair.recommended).length / surfacePairs.length : null,
      citation: surfacePairs.length ? surfacePairs.filter((pair) => pair.cited).length / surfacePairs.length : null,
    };
  });

  const stablePairs = pairsOnValidated.filter((pair) => pair.stable_mention).length;
  const repeatStability = pairsOnValidated.length ? stablePairs / pairsOnValidated.length : null;
  const surfacesWithMention = surfaceRows.filter((row) => (row.mention || 0) > 0).length;
  const surfaceBreadth = surfaceRows.length ? surfacesWithMention / surfaceRows.length : null;

  let targetRecommendations = 0;
  let competitorRecommendations = 0;
  for (const pair of pairsOnValidated) {
    if (pair.recommended) targetRecommendations += 1;
    competitorRecommendations += pair.competitor_recommended.size;
  }
  const competitiveShare = targetRecommendations + competitorRecommendations
    ? targetRecommendations / (targetRecommendations + competitorRecommendations)
    : null;

  return {
    pairs: pairsOnValidated.length,
    repeat_stability: repeatStability,
    surface_breadth: surfaceBreadth,
    mention_coverage: mentionCoverage,
    recommendation_coverage: recommendationCoverage,
    citation_coverage: citationCoverage,
    prompt_intent_coverage: promptIntentCoverage,
    competitive_share: competitiveShare,
    target_recommendations: targetRecommendations,
    competitor_recommendations: competitorRecommendations,
    by_surface: surfaceRows,
    by_intent: intentRows.map((row) => ({
      intent_id: row.intent.id,
      service_id: row.intent.service_id,
      weight: row.weight,
      mention: round(row.mention),
      recommendation: round(row.recommendation),
      citation: round(row.citation),
    })),
    pairs_detail: pairsOnValidated.map((pair) => ({
      surface_id: pair.surface_id,
      prompt_id: pair.prompt_id,
      intent_id: pair.intent_id,
      source_type: pair.source_type,
      repeats: pair.repeats,
      mentioned: pair.mentioned,
      recommended: pair.recommended,
      cited: pair.cited,
      stable_mention: pair.stable_mention,
      cited_domains: pair.cited_domains,
    })),
  };
}

function mapsSurfaceStats(audit, surface, intents) {
  const observations = (audit.maps?.observations || []).filter(
    (observation) => observation.surface === surface && !observation.not_collected,
  );
  const byIntent = toMap(observations, "intent_id");
  const rows = [];
  for (const intent of intents) {
    const intentObservations = byIntent.get(intent.id) || [];
    if (!intentObservations.length) continue;
    const topN = (n) =>
      intentObservations.filter((observation) => observation.target_found && observation.rank && observation.rank <= n).length /
      intentObservations.length;
    const best = bestRank(intentObservations);
    rows.push({
      intent,
      weight: intent.weight,
      top3: topN(3),
      top10: topN(10),
      top20: topN(20),
      best,
    });
  }
  const weightSum = sum(rows.map((row) => row.weight));
  const weighted = (valueOf) => (weightSum ? sum(rows.map((row) => row.weight * valueOf(row))) / weightSum : null);
  const withBest = rows.filter((row) => row.best !== null);
  return {
    surface,
    label: SURFACE_LABELS[surface] || surface,
    observations: observations.length,
    intents_observed: rows.length,
    intents_planned: intents.length,
    query_coverage: intents.length ? rows.length / intents.length : null,
    top3: weighted((row) => row.top3),
    top10: weighted((row) => row.top10),
    top20: weighted((row) => row.top20),
    demand_weighted_top3: weighted((row) => row.top3),
    demand_weighted_top10: weighted((row) => row.top10),
    demand_weighted_top20: weighted((row) => row.top20),
    demand_weighted_rank_credit: weighted((row) => rankCredit(row.best)),
    avg_visible_position: withBest.length
      ? sum(withBest.map((row) => row.weight * row.best)) / sum(withBest.map((row) => row.weight))
      : null,
  };
}

function organicStats(audit, intents) {
  const observations = (audit.organic?.observations || []).filter((observation) => !observation.not_collected);
  const organicIntentIds = new Set(
    coreQueriesOf(audit)
      .filter((query) => (query.surfaces || []).includes("google_organic"))
      .map((query) => query.intent_id),
  );
  const byIntent = toMap(observations, "intent_id");
  const rows = [];
  for (const intent of intents) {
    if (!organicIntentIds.has(intent.id)) continue;
    const observation = (byIntent.get(intent.id) || [])[0];
    if (!observation) continue;
    const found = observation.target_found && Number.isInteger(observation.rank);
    rows.push({
      intent,
      weight: intent.weight,
      rank: found ? observation.rank : null,
      top3: found && observation.rank <= 3 ? 1 : 0,
      top10: found && observation.rank <= 10 ? 1 : 0,
      top20: found && observation.rank <= 20 ? 1 : 0,
      credit: rankCredit(found ? observation.rank : null),
      url: observation.url || "",
      domain: observation.domain || "",
    });
  }
  const weightSum = sum(rows.map((row) => row.weight));
  const weighted = (valueOf) => (weightSum ? sum(rows.map((row) => row.weight * valueOf(row))) / weightSum : null);
  const planned = intents.filter((intent) => organicIntentIds.has(intent.id)).length;
  return {
    observations: rows.length,
    intents_observed: rows.length,
    intents_planned: planned,
    query_coverage: planned ? rows.length / planned : null,
    top3: weighted((row) => row.top3),
    top10: weighted((row) => row.top10),
    top20: weighted((row) => row.top20),
    demand_weighted_top3: weighted((row) => row.top3),
    demand_weighted_top10: weighted((row) => row.top10),
    demand_weighted_top20: weighted((row) => row.top20),
    demand_weighted_rank_credit: weighted((row) => row.credit),
    avg_visible_position: rows.filter((row) => row.rank).length
      ? sum(rows.filter((row) => row.rank).map((row) => row.weight * row.rank)) /
        sum(rows.filter((row) => row.rank).map((row) => row.weight))
      : null,
    rows: rows.map((row) => ({
      intent_id: row.intent.id,
      service_id: row.intent.service_id,
      weight: row.weight,
      rank: row.rank,
      url: row.url,
      domain: row.domain,
    })),
  };
}

function geoStats(audit, gridIntents) {
  const center = audit.maps?.grid?.center || audit.market?.center || { lat: 0, lng: 0 };
  const mapsObservations = (audit.maps?.observations || []).filter((observation) => !observation.not_collected);
  const gridIntentIds = new Set(gridIntents.map((intent) => intent.id));
  const gridObservations = mapsObservations.filter((observation) => gridIntentIds.has(observation.intent_id));
  const byIntent = toMap(gridObservations, "intent_id");
  const businessIds = businessCompetitorIds(audit);

  // Per-intent point coverage is the primary geo-grid consistency metric.
  // A single strong intent should not make every point look covered.
  const intentRows = [];
  for (const intent of gridIntents) {
    const rows = byIntent.get(intent.id) || [];
    if (!rows.length) continue;
    const points = new Set(rows.map((observation) => observation.point_id));
    const covered = new Set(
      rows
        .filter((observation) => observation.target_found && observation.rank && observation.rank <= 10)
        .map((observation) => observation.point_id),
    );
    intentRows.push({ intent, coverage: points.size ? covered.size / points.size : 0 });
  }
  const weightSum = sum(intentRows.map((row) => row.intent.weight));
  const geoGridCoverage = weightSum
    ? sum(intentRows.map((row) => row.intent.weight * row.coverage)) / weightSum
    : null;

  const quadrantStats = {
    NE: { observations: 0, target: 0, competitors: {} },
    NW: { observations: 0, target: 0, competitors: {} },
    SE: { observations: 0, target: 0, competitors: {} },
    SW: { observations: 0, target: 0, competitors: {} },
  };
  const observedPoints = new Set();
  const coveredPoints = new Set();
  for (const observation of gridObservations) {
    observedPoints.add(observation.point_id);
    const quadrant = quadrantOf(observation, center);
    const stats = quadrantStats[quadrant];
    stats.observations += 1;
    if (observation.target_found && observation.rank && observation.rank <= 10) {
      stats.target += 1;
      coveredPoints.add(observation.point_id);
    }
    for (const competitor of observation.competitors || []) {
      if (!businessIds.has(competitor.id) || !competitor.rank || competitor.rank > 10) continue;
      stats.competitors[competitor.id] = (stats.competitors[competitor.id] || 0) + 1;
    }
  }

  const quadrantCoverage = {};
  const quadrantCounts = {};
  for (const [quadrant, stats] of Object.entries(quadrantStats)) {
    quadrantCoverage[quadrant] = stats.observations ? stats.target / stats.observations : null;
    quadrantCounts[quadrant] = stats.target;
  }
  const coverageValues = Object.values(quadrantCoverage).filter((value) => value !== null);

  let quadrantsMeetingMedian = 0;
  let quadrantsCompared = 0;
  for (const [quadrant, stats] of Object.entries(quadrantStats)) {
    if (!stats.observations) continue;
    // A quadrant where neither the target nor a locked competitor appears has
    // no comparable visibility. Counting 0 >= 0 as "meeting the median" would
    // reward an empty market.
    const competitorVisibility = Object.values(stats.competitors).some((count) => count > 0);
    if (stats.target === 0 && !competitorVisibility) continue;
    const target = stats.target / stats.observations;
    const competitorValues = (audit.competitors?.business || []).map((competitor) => {
      const count = stats.competitors[competitor.id] || 0;
      return count / stats.observations;
    });
    quadrantsCompared += 1;
    if (target >= median(competitorValues)) quadrantsMeetingMedian += 1;
  }

  return {
    points_observed: observedPoints.size,
    points_planned: audit.maps?.grid?.points || observedPoints.size,
    covered_points: coveredPoints.size,
    geo_grid_coverage: geoGridCoverage,
    weakest_quadrant: coverageValues.length ? Math.min(...coverageValues) : null,
    quadrant_coverage: quadrantCoverage,
    quadrant_counts: quadrantCounts,
    geo_hhi: hhi(Object.values(quadrantCounts)),
    geo_gap_score: quadrantsCompared ? quadrantsMeetingMedian / quadrantsCompared : null,
    by_intent: intentRows.map((row) => ({ intent_id: row.intent.id, coverage: round(row.coverage) })),
  };
}

function serviceStats(audit, intents, mapsBySurface, organic, ai, gridIntents) {
  const services = audit.query_universe?.services || [];
  const serviceRows = [];
  const businessIds = businessCompetitorIds(audit);
  const allSearchObservations = [
    ...(audit.maps?.observations || []).filter((observation) => !observation.not_collected),
    ...(audit.organic?.observations || []).filter((observation) => !observation.not_collected),
  ];

  for (const service of services) {
    const serviceIntents = intents.filter((intent) => intent.service_id === service.id);
    if (!serviceIntents.length) continue;
    const serviceGridIntents = gridIntents.filter((intent) => intent.service_id === service.id);
    const mapsObs = (audit.maps?.observations || []).filter(
      (observation) =>
        !observation.not_collected &&
        serviceGridIntents.some((intent) => intent.id === observation.intent_id),
    );
    const mapsTop10 = mapsObs.length
      ? mapsObs.filter((observation) => observation.target_found && observation.rank && observation.rank <= 10).length / mapsObs.length
      : null;
    const organicIntentIds = new Set(
      coreQueriesOf(audit)
        .filter((query) => query.service_id === service.id && (query.surfaces || []).includes("google_organic"))
        .map((query) => query.intent_id),
    );
    const organicRows = organic.rows.filter((row) => organicIntentIds.has(row.intent_id));
    const organicTop10 = organicRows.length
      ? organicRows.filter((row) => row.rank && row.rank <= 10).length / organicRows.length
      : null;
    const aiRows = ai.by_intent.filter((row) => row.service_id === service.id);
    const aiMention = aiRows.length ? mean(aiRows.map((row) => row.mention)) : null;
    const aiRecommendation = aiRows.length ? mean(aiRows.map((row) => row.recommendation)) : null;
    const aiCitation = aiRows.length ? mean(aiRows.map((row) => row.citation)) : null;

    const targetTop10 = allSearchObservations.filter(
      (observation) =>
        serviceIntents.some((intent) => intent.id === observation.intent_id) &&
        observation.target_found &&
        observation.rank &&
        observation.rank <= 10,
    ).length;
    const competitorCounts = new Map((audit.competitors?.business || []).map((competitor) => [competitor.id, 0]));
    for (const observation of allSearchObservations) {
      if (!serviceIntents.some((intent) => intent.id === observation.intent_id)) continue;
      for (const competitor of observation.competitors || []) {
        if (businessIds.has(competitor.id) && competitor.rank && competitor.rank <= 10) {
          competitorCounts.set(competitor.id, (competitorCounts.get(competitor.id) || 0) + 1);
        }
      }
    }
    const competitorTotal = sum([...competitorCounts.values()]);
    const total = targetTop10 + competitorTotal;
    const targetShare = total ? targetTop10 / total : 0;
    const competitorShares = [...competitorCounts.values()].map((value) => (total ? value / total : 0));
    const competitorMedian = median(competitorShares);

    serviceRows.push({
      service_id: service.id,
      label: service.label,
      priority: service.priority,
      weight: round(sum(serviceIntents.map((intent) => intent.weight))),
      maps_top10: round(mapsTop10),
      organic_top10: round(organicTop10),
      ai_mention: round(aiMention),
      ai_recommendation: round(aiRecommendation),
      ai_citation: round(aiCitation),
      target_top10: targetTop10,
      competitor_top10: competitorTotal,
      target_share: round(targetShare),
      competitor_median_share: round(competitorMedian),
      meets_competitor_median: targetShare >= competitorMedian,
    });
  }

  const mapsEligible = serviceRows.filter((row) => row.maps_top10 !== null);
  const organicEligible = serviceRows.filter((row) => row.organic_top10 !== null);
  const serviceGapRows = serviceRows.filter((row) => row.target_top10 + row.competitor_top10 > 0);
  return {
    rows: serviceRows,
    maps_coverage_share: mapsEligible.length
      ? mapsEligible.filter((row) => row.maps_top10 >= 0.4).length / mapsEligible.length
      : 0,
    organic_coverage_share: organicEligible.length
      ? organicEligible.filter((row) => row.organic_top10 >= 0.3).length / organicEligible.length
      : 0,
    service_gap_score: serviceGapRows.length
      ? serviceGapRows.filter((row) => row.meets_competitor_median).length / serviceGapRows.length
      : 0,
  };
}

function competitiveStats(audit, intentById, ai) {
  const businessIds = businessCompetitorIds(audit);
  const mapsObservations = (audit.maps?.observations || []).filter((observation) => !observation.not_collected);
  const organicObservations = (audit.organic?.observations || []).filter((observation) => !observation.not_collected);

  const shareFor = (observations, topN) => {
    let target = 0;
    let competitors = 0;
    for (const observation of observations) {
      if (observation.target_found && observation.rank && observation.rank <= topN) target += 1;
      for (const competitor of observation.competitors || []) {
        if (businessIds.has(competitor.id) && competitor.rank && competitor.rank <= topN) competitors += 1;
      }
    }
    return target + competitors ? target / (target + competitors) : null;
  };

  return {
    top3_share: shareFor([...mapsObservations, ...organicObservations], 3),
    top10_share: shareFor([...mapsObservations, ...organicObservations], 10),
    maps_share: shareFor(mapsObservations, 10),
    organic_share: shareFor(organicObservations, 10),
    ai_share: ai.competitive_share,
  };
}

function authorityStats(audit, ai) {
  const authority = audit.authority || {};
  const referring = authority.referring_domains || [];
  const relevant = referring.filter(
    (domain) => ["local", "industry", "manufacturer", "association"].includes(domain.type) && ["high", "medium"].includes(domain.relevance),
  );
  const localSources = relevant.filter((domain) => domain.type === "local").length;
  const industrySources = relevant.filter((domain) => ["industry", "manufacturer", "association"].includes(domain.type)).length;
  const listings = authority.listings || [];
  const listingConsistency = listings.length
    ? listings.reduce(
        (total, listing) =>
          total +
          [listing.name_consistent, listing.domain_consistent, listing.phone_consistent, listing.category_consistent].filter(Boolean).length /
            4,
        0,
      ) / listings.length
    : null;
  const competitorDomainCounts = (authority.competitor_referring_domains || []).map((entry) => entry.relevant_domains || 0);
  const competitorMedian = competitorDomainCounts.length ? median(competitorDomainCounts) : 0;
  const citationDomains = new Set((authority.ai_citation_domains || []).map((domain) => String(domain).toLowerCase()));
  for (const pair of ai.pairs_detail) {
    for (const domain of pair.cited_domains || []) citationDomains.add(String(domain).toLowerCase());
  }
  const overlap = relevant.filter((domain) =>
    citationDomains.has(String(domain.main_domain || domain.domain).toLowerCase()) ||
    citationDomains.has(String(domain.domain).toLowerCase()),
  ).length;
  return {
    referring_domains: referring.length,
    relevant_domains: relevant.length,
    local_sources: localSources,
    industry_sources: industrySources,
    listing_consistency: listingConsistency,
    competitor_median_relevant_domains: competitorMedian,
    ai_citation_overlap: relevant.length ? overlap / relevant.length : 0,
    ai_citation_domains: [...citationDomains].sort(),
  };
}

function resilienceStats(audit, mapsStats, organic, ai, geo, intentById) {
  const mapsTop10 = (audit.maps?.observations || []).filter(
    (observation) => !observation.not_collected && observation.target_found && observation.rank && observation.rank <= 10,
  ).length;
  const organicTop10 = (audit.organic?.observations || []).filter(
    (observation) => !observation.not_collected && observation.target_found && observation.rank && observation.rank <= 10,
  ).length;
  const aiMentions = ai.by_intent.reduce((total, row) => total + (row.mention || 0), 0);
  const surfaceShares = { maps: mapsTop10, organic: organicTop10, ai: aiMentions };
  const surfaceTotal = sum(Object.values(surfaceShares));
  const surfaceHhi = surfaceTotal
    ? hhi(Object.values(surfaceShares))
    : 1;

  const services = audit.query_universe?.services || [];
  const serviceVisibility = services.map((service) =>
    sum(
      (intentById.get(service.id) || []).map((intent) => {
        const bestMaps = bestRank((audit.maps?.observations || []).filter((observation) => observation.intent_id === intent.id));
        const organicObservation = (audit.organic?.observations || []).find(
          (observation) => observation.intent_id === intent.id && !observation.not_collected,
        );
        const organicRank = organicObservation?.target_found ? organicObservation.rank : null;
        const aiRow = ai.by_intent.find((row) => row.intent_id === intent.id);
        const visible = (bestMaps && bestMaps <= 20) || (organicRank && organicRank <= 20) || (aiRow && (aiRow.mention > 0 || aiRow.recommendation > 0));
        return visible ? intent.weight : 0;
      }),
    ),
  );
  const serviceHhi = hhi(serviceVisibility);

  const brandedQueries = new Set(
    (audit.query_universe?.queries || []).filter((query) => query.brand === "brand").map((query) => query.intent_id),
  );
  const branded = (audit.organic?.observations || []).filter(
    (observation) => brandedQueries.has(observation.intent_id) && !observation.not_collected && observation.target_found,
  ).length;
  const nonBranded = (audit.organic?.observations || []).filter(
    (observation) => !brandedQueries.has(observation.intent_id) && !observation.not_collected && observation.target_found,
  ).length;
  const brandedShare = branded + nonBranded ? branded / (branded + nonBranded) : null;

  const visibilityIndex = mean(
    [mapsStats.google_maps?.top10, organic.top10, ai.mention_coverage].filter(
      (value) => value !== null && value !== undefined,
    ),
  );
  const history = audit.resilience?.history || [];
  const prior = history.length ? history[history.length - 1] : null;
  const trendScore = prior && visibilityIndex !== null
    ? visibilityIndex >= Number(prior.visibility_index) * 0.9
      ? 1
      : 0
    : null;

  return {
    surface_appearances: surfaceShares,
    surface_hhi: round(surfaceHhi),
    service_hhi: round(serviceHhi),
    geo_hhi: round(geo.geo_hhi),
    branded_share: round(brandedShare),
    visibility_index: round(visibilityIndex),
    trend_available: Boolean(prior),
    trend_score: trendScore,
    trend_prior: prior,
  };
}

export function computeMetrics(audit) {
  const intents = coreIntentsOf(audit);
  const gridQueries = gridQueriesOf(audit);
  const gridIntentIds = new Set(gridQueries.map((query) => query.intent_id));
  const gridIntents = intents.filter((intent) => gridIntentIds.has(intent.id));
  const intentById = new Map();
  for (const intent of intents) {
    if (!intentById.has(intent.service_id)) intentById.set(intent.service_id, []);
    intentById.get(intent.service_id).push(intent);
  }

  const bySurface = {};
  for (const surface of ["google_local_pack", "google_maps", "google_local_finder"]) {
    bySurface[surface] = mapsSurfaceStats(audit, surface, gridIntents);
  }
  const organic = organicStats(audit, intents);
  bySurface.google_organic = { ...organic, surface: "google_organic", label: "Google organic" };
  const ai = aiStats(audit, intents);
  const geo = geoStats(audit, gridIntents);
  const services = serviceStats(audit, intents, bySurface, organic, ai, gridIntents);
  const competitive = competitiveStats(audit, intentById, ai);
  competitive.service_gap_score = services.service_gap_score;
  competitive.geo_gap_score = geo.geo_gap_score;
  const authority = authorityStats(audit, ai);
  const resilience = resilienceStats(audit, bySurface, organic, ai, geo, intentById);

  const byIntent = intents.map((intent) => {
    const bestMaps = bestRank(
      (audit.maps?.observations || []).filter((observation) => observation.intent_id === intent.id),
    );
    const organicObservation = (audit.organic?.observations || []).find(
      (observation) => observation.intent_id === intent.id && !observation.not_collected,
    );
    const organicRank = organicObservation?.target_found ? organicObservation.rank : null;
    const aiRow = ai.by_intent.find((row) => row.intent_id === intent.id);
    return {
      intent_id: intent.id,
      service_id: intent.service_id,
      class: intent.class,
      weight: intent.weight,
      best_maps_rank: bestMaps,
      best_organic_rank: organicRank,
      ai_mention: aiRow?.mention ?? null,
      ai_recommendation: aiRow?.recommendation ?? null,
      ai_citation: aiRow?.citation ?? null,
      any_visibility: Boolean(
        (bestMaps && bestMaps <= 20) ||
          (organicRank && organicRank <= 20) ||
          (aiRow && (aiRow.mention > 0 || aiRow.recommendation > 0)),
      ),
    };
  });
  const intentRows = new Map(byIntent.map((row) => [row.intent_id, row]));

  const classCoverage = (classes, predicate) => {
    const rows = intents.filter((intent) => classes.includes(intent.class));
    if (!rows.length) return null;
    const weightTotal = sum(rows.map((intent) => intent.weight));
    if (!weightTotal) return 0;
    return sum(
      rows.map((intent) => (predicate(intentRows.get(intent.id)) ? intent.weight : 0)),
    ) / weightTotal;
  };

  const serviceCoverageRows = (audit.query_universe?.services || []).map((service) => {
    const rows = intents.filter((intent) => intent.service_id === service.id);
    return rows.some((intent) => intentRows.get(intent.id)?.any_visibility);
  });
  const serviceClusterCoverage = serviceCoverageRows.length
    ? serviceCoverageRows.filter(Boolean).length / serviceCoverageRows.length
    : 0;

  const demandWeightedCoverage = classCoverage(
    [...new Set(intents.map((intent) => intent.class))],
    (row) => row?.any_visibility,
  );

  // For class coverage, use the share of observations that clear the band, not
  // a single best rank. One lucky grid point must not make a weak service look
  // fully covered.
  const mapsByIntent = toMap(
    (audit.maps?.observations || []).filter((observation) => !observation.not_collected),
    "intent_id",
  );
  const presenceRate = (intentId, band) => {
    const observations = mapsByIntent.get(intentId) || [];
    const mapsRate = observations.length
      ? observations.filter(
          (observation) => observation.target_found && observation.rank && observation.rank <= band,
        ).length / observations.length
      : 0;
    const row = intentRows.get(intentId);
    const organicRate = row?.best_organic_rank && row.best_organic_rank <= band ? 1 : 0;
    const aiRate = row?.ai_mention || 0;
    return Math.max(mapsRate, organicRate, aiRate);
  };
  const rateCoverage = (classes, band) => {
    const rows = intents.filter((intent) => classes.includes(intent.class));
    if (!rows.length) return null;
    const weightTotal = sum(rows.map((intent) => intent.weight));
    if (!weightTotal) return 0;
    return sum(rows.map((intent) => intent.weight * presenceRate(intent.id, band))) / weightTotal;
  };

  const highCommercialCoverage = rateCoverage(
    ["service", "emergency", "near_me", "city_modified", "high_ticket"],
    10,
  );
  const emergencyCoverage = rateCoverage(["emergency"], 10);
  const cityCoverage = rateCoverage(["city_modified"], 20);
  const nearMeCoverage = rateCoverage(["near_me"], 10);
  const problemCoverage = rateCoverage(["problem_symptom"], 20);
  const cityOrganicRows = organic.rows.filter((row) => intentRows.get(row.intent_id)?.class === "city_modified");
  const cityOrganicTop20 = cityOrganicRows.length
    ? cityOrganicRows.filter((row) => row.rank && row.rank <= 20).length / cityOrganicRows.length
    : null;

  const anyVisibility = byIntent.some((row) => row.any_visibility);
  const visibilityMatrix = services.rows.map((row) => {
    const maps = labelFor(row.maps_top10);
    const org = labelFor(row.organic_top10);
    const aiLabel = labelFor(row.ai_mention);
    const labels = [maps, org, aiLabel].filter((label) => label !== "N/A");
    let opportunity = "N/A";
    if (labels.length) {
      if (labels.every((label) => label === "Strong")) opportunity = "Maintain";
      else if (labels.includes("Absent") && row.priority === "primary") opportunity = "Critical";
      else if (labels.includes("Absent") || labels.includes("Weak")) opportunity = "High";
      else if (labels.includes("Partial")) opportunity = "Improve";
      else opportunity = "Maintain";
    }
    return {
      service: row.label,
      maps,
      organic: org,
      ai: aiLabel,
      opportunity,
    };
  });

  const counts = validityCounts(audit);

  return {
    generated_by: "metrics.mjs",
    version: METRICS_VERSION,
    by_surface: bySurface,
    by_intent: byIntent,
    by_service: services.rows,
    coverage: {
      service_cluster_coverage: round(serviceClusterCoverage),
      demand_weighted_coverage: round(demandWeightedCoverage),
      high_commercial_coverage: round(highCommercialCoverage),
      emergency_coverage: round(emergencyCoverage),
      city_coverage: round(cityCoverage),
      near_me_coverage: round(nearMeCoverage),
      problem_coverage: round(problemCoverage),
      city_organic_top20: round(cityOrganicTop20),
      any_visibility_present: anyVisibility,
      non_branded_discovery_present: anyVisibility,
      service_maps_coverage_share: round(services.maps_coverage_share),
      service_organic_coverage_share: round(services.organic_coverage_share),
      visibility_index: resilience.visibility_index,
    },
    competitive: {
      top3_share: round(competitive.top3_share),
      top10_share: round(competitive.top10_share),
      maps_share: round(competitive.maps_share),
      organic_share: round(competitive.organic_share),
      ai_share: round(competitive.ai_share),
      service_gap_score: round(competitive.service_gap_score),
      geo_gap_score: round(competitive.geo_gap_score),
    },
    authority: {
      ...authority,
      listing_consistency: round(authority.listing_consistency),
      ai_citation_overlap: round(authority.ai_citation_overlap),
    },
    resilience: {
      ...resilience,
      surface_hhi: round(resilience.surface_hhi),
      service_hhi: round(resilience.service_hhi),
      geo_hhi: round(resilience.geo_hhi),
      branded_share: round(resilience.branded_share),
      visibility_index: round(resilience.visibility_index),
    },
    ai,
    geo: {
      ...geo,
      geo_grid_coverage: round(geo.geo_grid_coverage),
      weakest_quadrant: round(geo.weakest_quadrant),
      geo_hhi: round(geo.geo_hhi),
      geo_gap_score: round(geo.geo_gap_score),
    },
    counts,
    visibility_matrix: visibilityMatrix,
  };
}

function validityCounts(audit) {
  const gridQueries = gridQueriesOf(audit);
  const coreQueries = coreQueriesOf(audit);
  const corePrompts = (audit.query_universe?.prompts || []).filter((prompt) => prompt.role === "core");
  const repeats = Number(audit.configuration?.ai_repeats) || 3;
  const mapsSurfaces = audit.maps?.surfaces || ["google_local_pack", "google_maps"];
  const plannedMaps = gridQueries.length * (audit.maps?.grid?.points || 0) * mapsSurfaces.length;
  const collectedMaps = (audit.maps?.observations || []).filter((observation) => !observation.not_collected).length;
  const organicPlanned = coreQueries.filter((query) => (query.surfaces || []).includes("google_organic")).length;
  const organicCoreIntentIds = new Set(
    coreQueries.filter((query) => (query.surfaces || []).includes("google_organic")).map((query) => query.intent_id),
  );
  const organicCollected = new Set(
    (audit.organic?.observations || [])
      .filter((observation) => !observation.not_collected && organicCoreIntentIds.has(observation.intent_id))
      .map((observation) => observation.intent_id),
  ).size;
  const aiPlanned = corePrompts.length * repeats;
  const aiCollected = (audit.ai?.observations || []).filter((observation) => !observation.not_collected).length;
  return {
    planned: {
      core_queries: coreQueries.length,
      maps_observations: plannedMaps,
      organic_observations: organicPlanned,
      ai_prompt_runs: aiPlanned,
    },
    collected: {
      core_queries: coreQueries.length,
      maps_observations: collectedMaps,
      organic_observations: organicCollected,
      ai_prompt_runs: aiCollected,
    },
  };
}

const GATE_LABELS = {
  schema_valid: "Artifact schema is valid",
  target_resolved: "Target business resolved",
  query_universe_locked: "Query universe locked",
  market_match: "Market configuration matches the universe",
  core_query_coverage: "Core query coverage",
  grid_coverage: "Geo-grid coverage",
  ai_surface_availability: "Validated AI surface available",
  ai_repeat_completeness: "AI repeat completeness",
  competitor_cohort_locked: "Competitor cohort locked",
  authority_data_present: "Authority data present",
  provider_error_rate: "Provider error rate",
  critical_source_outage: "No critical source outage",
};

export function evaluateValidity(audit) {
  const gates = [];
  const add = (id, passed, detail) => {
    gates.push({ id, label: GATE_LABELS[id] || id, passed: Boolean(passed), detail: detail || "" });
  };
  const universe = audit.query_universe || {};
  const business = audit.business || {};
  const config = audit.configuration || {};
  const market = audit.market || {};
  const competitors = audit.competitors || {};
  const gridQueries = gridQueriesOf(audit);
  const coreQueries = coreQueriesOf(audit);
  const mapsSurfaces = audit.maps?.surfaces || ["google_local_pack", "google_maps"];
  const points = audit.maps?.grid?.points || 0;
  const mapsObservations = (audit.maps?.observations || []).filter((observation) => !observation.not_collected);

  add("schema_valid", audit.schema_version === "1.0", `schema_version=${audit.schema_version}`);
  add(
    "target_resolved",
    Boolean(business.resolution?.resolved) && Number(business.resolution?.confidence) >= 0.8,
    `resolved=${Boolean(business.resolution?.resolved)} confidence=${business.resolution?.confidence ?? "n/a"}`,
  );
  add(
    "query_universe_locked",
    Boolean(universe.locked) && typeof universe.hash === "string" && universe.hash.startsWith("sha256:"),
    `locked=${Boolean(universe.locked)} hash=${universe.hash ? "present" : "missing"}`,
  );
  add(
    "market_match",
    Boolean(
      universe.market?.name === market.name &&
        universe.trade === config.trade &&
        universe.language === market.language &&
        universe.device === market.device,
    ),
    "trade, market, language, and device must match",
  );

  let mapsCoverageOk = true;
  let gridCoverageOk = true;
  const coverageDetails = [];
  for (const surface of mapsSurfaces) {
    const surfaceObservations = mapsObservations.filter((observation) => observation.surface === surface);
    const observedIntents = new Set(surfaceObservations.map((observation) => observation.intent_id));
    const queryCoverage = gridQueries.length ? observedIntents.size / gridQueries.length : 0;
    const observedPoints = new Set(surfaceObservations.map((observation) => observation.point_id));
    const gridCoverage = points ? observedPoints.size / points : 0;
    if (queryCoverage < 0.8) mapsCoverageOk = false;
    if (gridCoverage < 0.8) gridCoverageOk = false;
    coverageDetails.push(`${surface}: queries ${(queryCoverage * 100).toFixed(0)}%, points ${(gridCoverage * 100).toFixed(0)}%`);
  }
  const organicObservations = (audit.organic?.observations || []).filter((observation) => !observation.not_collected);
  const organicIntentsPlanned = new Set(
    coreQueries.filter((query) => (query.surfaces || []).includes("google_organic")).map((query) => query.intent_id),
  );
  const organicIntentObserved = new Set(
    organicObservations
      .filter((observation) => organicIntentsPlanned.has(observation.intent_id))
      .map((observation) => observation.intent_id),
  );
  const organicCoverage = organicIntentsPlanned.size ? organicIntentObserved.size / organicIntentsPlanned.size : 0;
  const aiObservations = (audit.ai?.observations || []).filter((observation) => !observation.not_collected);
  const corePrompts = (universe.prompts || []).filter((prompt) => prompt.role === "core");
  const repeats = Number(config.ai_repeats) || 3;
  const aiPlanned = corePrompts.length * repeats;
  const aiCoverage = aiPlanned ? aiObservations.length / aiPlanned : 0;
  add(
    "core_query_coverage",
    mapsCoverageOk && organicCoverage >= 0.8 && aiCoverage >= 0.8,
    `maps ${coverageDetails.join("; ")}; organic ${(organicCoverage * 100).toFixed(0)}%; ai ${(aiCoverage * 100).toFixed(0)}%`,
  );
  add("grid_coverage", gridCoverageOk, coverageDetails.join("; "));

  const validatedSurfaces = (audit.ai?.surfaces || []).filter((surface) => surface.validated && surface.available);
  const surfacesWithObservations = new Set(aiObservations.map((observation) => observation.surface_id));
  add(
    "ai_surface_availability",
    validatedSurfaces.some((surface) => surfacesWithObservations.has(surface.id)),
    `validated=${validatedSurfaces.length} observed=${surfacesWithObservations.size}`,
  );

  const promptRepeatCounts = new Map();
  for (const observation of aiObservations) {
    if (!promptRepeatCounts.has(observation.prompt_id)) promptRepeatCounts.set(observation.prompt_id, new Set());
    promptRepeatCounts.get(observation.prompt_id).add(observation.repeat);
  }
  const promptCompletenessOk = corePrompts.every(
    (prompt) => (promptRepeatCounts.get(prompt.id)?.size || 0) >= Math.ceil(repeats * 0.8),
  ) && corePrompts.length > 0;
  add(
    "ai_repeat_completeness",
    promptCompletenessOk,
    `${promptRepeatCounts.size}/${corePrompts.length} prompts with repeats; configured ${repeats}`,
  );
  add(
    "competitor_cohort_locked",
    Boolean(competitors.locked) && (competitors.business || []).length >= 2,
    `locked=${Boolean(competitors.locked)} business=${(competitors.business || []).length}`,
  );
  add(
    "authority_data_present",
    (audit.authority?.referring_domains || []).length > 0 || (audit.authority?.listings || []).length > 0,
    `referring_domains=${(audit.authority?.referring_domains || []).length} listings=${(audit.authority?.listings || []).length}`,
  );
  add(
    "provider_error_rate",
    Number(audit.validity?.provider_error_rate ?? 0) <= 0.1,
    `error_rate=${audit.validity?.provider_error_rate ?? 0}`,
  );
  add(
    "critical_source_outage",
    audit.validity?.critical_source_outage !== true,
    `critical_source_outage=${Boolean(audit.validity?.critical_source_outage)}`,
  );

  return {
    passed: gates.every((gate) => gate.passed),
    gates,
    counts: validityCounts(audit),
  };
}

function requirementMet(requirement, audit) {
  const coreIntentIds = new Set(
    (audit.query_universe?.queries || [])
      .filter((query) => query.role === "core" && query.brand === "non_brand")
      .map((query) => query.intent_id),
  );
  switch (requirement) {
    case "organic_target_observations":
      return (audit.organic?.observations || []).some(
        (observation) =>
          !observation.not_collected &&
          observation.target_found === true &&
          coreIntentIds.has(observation.intent_id),
      );
    case "ai_target_observations":
      return (audit.ai?.observations || []).some(
        (observation) => !observation.not_collected && observation.target_mentioned === true,
      );
    case "listing_observations":
      return (audit.authority?.listings || []).length > 0;
    default:
      return true;
  }
}

const checkApplicability = (item, audit) => {
  const config = audit.configuration || {};
  if (item.applicability === "conditional" && !config[item.condition]) {
    return { applicable: false, reason: `condition not enabled: ${item.condition}` };
  }
  if (item.requires && !requirementMet(item.requires, audit)) {
    return { applicable: false, reason: `not observable: ${item.requires}` };
  }
  return { applicable: true, reason: "" };
};

const percent = (value) => (value === null || value === undefined ? "not available" : `${(value * 100).toFixed(1)}%`);
const numberText = (value, places = 2) => (value === null || value === undefined ? "not available" : Number(value).toFixed(places));

function evidenceFor(id, metrics) {
  const m = metrics;
  switch (id) {
    case "LV-INT-01": return `Core service clusters with qualified visibility: ${percent(m.coverage.service_cluster_coverage)}.`;
    case "LV-INT-02": return `Demand-weighted non-branded coverage: ${percent(m.coverage.demand_weighted_coverage)}.`;
    case "LV-INT-03": return `High-commercial-intent coverage: ${percent(m.coverage.high_commercial_coverage)}.`;
    case "LV-INT-04": return `Emergency-intent coverage: ${percent(m.coverage.emergency_coverage)}.`;
    case "LV-INT-05": return `Service + city intent coverage: ${percent(m.coverage.city_coverage)}.`;
    case "LV-INT-06": return `Near-me intent coverage: ${percent(m.coverage.near_me_coverage)}.`;
    case "LV-INT-07": return `Problem and symptom intent coverage: ${percent(m.coverage.problem_coverage)}.`;
    case "LV-MAP-01": return `Local Pack demand-weighted Top-3 coverage: ${percent(m.by_surface.google_local_pack.demand_weighted_top3)}.`;
    case "LV-MAP-02": return `Local Pack Top-10 coverage: ${percent(m.by_surface.google_local_pack.top10)}.`;
    case "LV-MAP-03": return `Local Pack Top-20 coverage: ${percent(m.by_surface.google_local_pack.top20)}.`;
    case "LV-MAP-04": return `Average visible Local Pack position: ${numberText(m.by_surface.google_local_pack.avg_visible_position, 1)}.`;
    case "LV-MAP-05": return `Google Maps demand-weighted Top-3 coverage: ${percent(m.by_surface.google_maps.demand_weighted_top3)}.`;
    case "LV-MAP-06": return `Google Maps Top-10 coverage: ${percent(m.by_surface.google_maps.top10)}.`;
    case "LV-MAP-07": return `Geo-grid coverage: ${percent(m.geo.geo_grid_coverage)} of observed grid points.`;
    case "LV-MAP-08": return `Service clusters with at least 40% Maps Top-10 coverage: ${percent(m.coverage.service_maps_coverage_share)}.`;
    case "LV-MAP-09": return `Weakest grid quadrant Top-10 coverage: ${percent(m.geo.weakest_quadrant)}.`;
    case "LV-MAP-10": return `Local Finder Top-10 coverage: ${percent(m.by_surface.google_local_finder.top10)}.`;
    case "LV-ORG-01": return `Demand-weighted organic Top-3 coverage: ${percent(m.by_surface.google_organic.demand_weighted_top3)}.`;
    case "LV-ORG-02": return `Organic Top-10 coverage: ${percent(m.by_surface.google_organic.top10)}.`;
    case "LV-ORG-03": return `Organic Top-20 coverage: ${percent(m.by_surface.google_organic.top20)}.`;
    case "LV-ORG-04": return `Demand-weighted organic rank credit: ${numberText(m.by_surface.google_organic.demand_weighted_rank_credit, 2)}.`;
    case "LV-ORG-05": return "Ranking URL relevance requires review.";
    case "LV-ORG-06": return `City-modified organic Top-20 coverage: ${percent(m.coverage.city_organic_top20)}.`;
    case "LV-ORG-07": return `Service clusters with at least 30% organic Top-10 coverage: ${percent(m.coverage.service_organic_coverage_share)}.`;
    case "LV-AI-01": return `AI mention coverage: ${percent(m.ai.mention_coverage)}.`;
    case "LV-AI-02": return `AI recommendation coverage: ${percent(m.ai.recommendation_coverage)}.`;
    case "LV-AI-03": return `AI citation coverage: ${percent(m.ai.citation_coverage)}.`;
    case "LV-AI-04": return "AI service relevance requires review.";
    case "LV-AI-05": return "AI location relevance requires review.";
    case "LV-AI-06": return "AI entity accuracy requires review.";
    case "LV-AI-07": return `Competitive share of AI recommendations: ${percent(m.ai.competitive_share)}.`;
    case "LV-AI-08": return `Prompt-intent coverage: ${percent(m.ai.prompt_intent_coverage)}.`;
    case "LV-AI-09": return `AI repeat stability: ${percent(m.ai.repeat_stability)}.`;
    case "LV-AI-10": return `Validated AI surface breadth: ${percent(m.ai.surface_breadth)}.`;
    case "LV-CMP-01": return `Business-competitor Top-3 share: ${percent(m.competitive.top3_share)}.`;
    case "LV-CMP-02": return `Business-competitor Top-10 share: ${percent(m.competitive.top10_share)}.`;
    case "LV-CMP-03": return `Maps share of visibility: ${percent(m.competitive.maps_share)}.`;
    case "LV-CMP-04": return `Organic share of visibility: ${percent(m.competitive.organic_share)}.`;
    case "LV-CMP-05": return `AI recommendation share: ${percent(m.competitive.ai_share)}.`;
    case "LV-CMP-06": return `Service clusters meeting the competitor median: ${percent(m.competitive.service_gap_score)}.`;
    case "LV-CMP-07": return `Grid quadrants meeting the competitor median: ${percent(m.competitive.geo_gap_score)}.`;
    case "LV-AUT-01": return `Relevant referring domains: ${m.authority.relevant_domains}.`;
    case "LV-AUT-02": return "Local source relevance requires review.";
    case "LV-AUT-03": return `Industry, manufacturer, and trade sources: ${m.authority.industry_sources}.`;
    case "LV-AUT-04": return `External listing consistency: ${percent(m.authority.listing_consistency)}.`;
    case "LV-AUT-05": return `Relevant domains vs cohort median: ${m.authority.relevant_domains} vs ${m.authority.competitor_median_relevant_domains}.`;
    case "LV-AUT-06": return `Authority overlap with AI citations: ${percent(m.authority.ai_citation_overlap)}.`;
    case "LV-RES-01": return `Surface HHI: ${numberText(m.resilience.surface_hhi, 2)} (lower is more diversified).`;
    case "LV-RES-02": return `Service HHI: ${numberText(m.resilience.service_hhi, 2)}.`;
    case "LV-RES-03": return `Geographic HHI: ${numberText(m.resilience.geo_hhi, 2)}.`;
    case "LV-RES-04": return `Branded share of search appearances: ${percent(m.resilience.branded_share)}.`;
    case "LV-RES-05": return `Visibility trend: ${m.resilience.trend_available ? `score ${m.resilience.trend_score}` : "no comparable prior run"}.`;
    default: return "";
  }
}

const bands = (value, thresholds) => {
  if (value === null || value === undefined) return 0;
  for (const [threshold, score] of thresholds) {
    if (value >= threshold) return score;
  }
  return 0;
};

function scoreFor(id, metrics) {
  const m = metrics;
  switch (id) {
    case "LV-INT-01": return bands(m.coverage.service_cluster_coverage, [[0.8, 3], [0.5, 2], [0.25, 1]]);
    case "LV-INT-02": return bands(m.coverage.demand_weighted_coverage, [[0.75, 3], [0.5, 2], [0.25, 1]]);
    case "LV-INT-03": return bands(m.coverage.high_commercial_coverage, [[0.7, 2], [0.35, 1]]);
    case "LV-INT-04": return bands(m.coverage.emergency_coverage, [[0.7, 2], [0.3, 1]]);
    case "LV-INT-05": return bands(m.coverage.city_coverage, [[0.7, 2], [0.3, 1]]);
    case "LV-INT-06": return bands(m.coverage.near_me_coverage, [[0.5, 1]]);
    case "LV-INT-07": return bands(m.coverage.problem_coverage, [[0.6, 2], [0.25, 1]]);
    case "LV-MAP-01": return bands(m.by_surface.google_local_pack.demand_weighted_top3, [[0.5, 3], [0.25, 2], [0.1, 1]]);
    case "LV-MAP-02": return bands(m.by_surface.google_local_pack.top10, [[0.7, 3], [0.45, 2], [0.2, 1]]);
    case "LV-MAP-03": return bands(m.by_surface.google_local_pack.top20, [[0.8, 2], [0.5, 1]]);
    case "LV-MAP-04": {
      const position = m.by_surface.google_local_pack.avg_visible_position;
      if (position === null) return 0;
      if (position <= 3) return 2;
      if (position <= 7) return 1;
      return 0;
    }
    case "LV-MAP-05": return bands(m.by_surface.google_maps.demand_weighted_top3, [[0.5, 3], [0.25, 2], [0.1, 1]]);
    case "LV-MAP-06": return bands(m.by_surface.google_maps.top10, [[0.7, 2], [0.4, 1]]);
    case "LV-MAP-07": return bands(m.geo.geo_grid_coverage, [[0.6, 3], [0.35, 2], [0.15, 1]]);
    case "LV-MAP-08": return bands(m.coverage.service_maps_coverage_share, [[0.75, 3], [0.5, 2], [0.25, 1]]);
    case "LV-MAP-09": return bands(m.geo.weakest_quadrant, [[0.4, 2], [0.15, 1]]);
    case "LV-MAP-10": return bands(m.by_surface.google_local_finder.top10, [[0.6, 2], [0.3, 1]]);
    case "LV-ORG-01": return bands(m.by_surface.google_organic.demand_weighted_top3, [[0.35, 3], [0.15, 2], [0.05, 1]]);
    case "LV-ORG-02": return bands(m.by_surface.google_organic.top10, [[0.6, 3], [0.35, 2], [0.15, 1]]);
    case "LV-ORG-03": return bands(m.by_surface.google_organic.top20, [[0.75, 2], [0.45, 1]]);
    case "LV-ORG-04": return bands(m.by_surface.google_organic.demand_weighted_rank_credit, [[0.6, 2], [0.3, 1]]);
    case "LV-ORG-06": return bands(m.coverage.city_organic_top20, [[0.7, 2], [0.3, 1]]);
    case "LV-ORG-07": return bands(m.coverage.service_organic_coverage_share, [[0.6, 1]]);
    case "LV-AI-01": return bands(m.ai.mention_coverage, [[0.6, 3], [0.35, 2], [0.15, 1]]);
    case "LV-AI-02": return bands(m.ai.recommendation_coverage, [[0.4, 3], [0.2, 2], [0.05, 1]]);
    case "LV-AI-03": return bands(m.ai.citation_coverage, [[0.35, 3], [0.15, 2], [0.05, 1]]);
    case "LV-AI-07": return bands(m.ai.competitive_share, [[0.25, 2], [0.1, 1]]);
    case "LV-AI-08": return bands(m.ai.prompt_intent_coverage, [[0.6, 2], [0.3, 1]]);
    case "LV-AI-09": return bands(m.ai.repeat_stability, [[0.8, 1]]);
    case "LV-AI-10": return bands(m.ai.surface_breadth, [[0.5, 1]]);
    case "LV-CMP-01": return bands(m.competitive.top3_share, [[0.25, 2], [0.1, 1]]);
    case "LV-CMP-02": return bands(m.competitive.top10_share, [[0.25, 2], [0.1, 1]]);
    case "LV-CMP-03": return bands(m.competitive.maps_share, [[0.25, 1]]);
    case "LV-CMP-04": return bands(m.competitive.organic_share, [[0.2, 1]]);
    case "LV-CMP-05": return bands(m.competitive.ai_share, [[0.2, 1]]);
    case "LV-CMP-06": return bands(m.competitive.service_gap_score, [[0.75, 2], [0.4, 1]]);
    case "LV-CMP-07": return bands(m.competitive.geo_gap_score, [[0.5, 1]]);
    case "LV-AUT-01": return bands(m.authority.relevant_domains, [[8, 2], [3, 1]]);
    case "LV-AUT-03": return bands(m.authority.industry_sources, [[4, 2], [1, 1]]);
    case "LV-AUT-04": return bands(m.authority.listing_consistency, [[0.8, 2], [0.5, 1]]);
    case "LV-AUT-05": return m.authority.relevant_domains >= m.authority.competitor_median_relevant_domains ? 1 : 0;
    case "LV-AUT-06": return bands(m.authority.ai_citation_overlap, [[0.25, 1]]);
    case "LV-RES-01": return m.resilience.surface_hhi !== null && m.resilience.surface_hhi <= 0.55 ? 1 : 0;
    case "LV-RES-02": return m.resilience.service_hhi !== null && m.resilience.service_hhi <= 0.5 ? 1 : 0;
    case "LV-RES-03": return m.resilience.geo_hhi !== null && m.resilience.geo_hhi <= 0.5 ? 1 : 0;
    case "LV-RES-04": return m.resilience.branded_share !== null && m.resilience.branded_share <= 0.2 ? 1 : 0;
    case "LV-RES-05": return m.resilience.trend_score === null ? 0 : m.resilience.trend_score;
    default: return null;
  }
}

function refsFor(id, audit) {
  const available = new Set((audit.sources || []).map((source) => source.id));
  const pick = (candidates) => candidates.filter((candidate) => available.has(candidate));
  const maps = pick(["google-local-pack", "google-maps", "google-local-finder"]);
  const organic = pick(["google-organic"]);
  const ai = pick(["google-ai-mode", "chatgpt-llm"]);
  const universe = pick(["query-universe"]);
  const authority = pick(["backlinks", "business-listings"]);
  if (id.startsWith("LV-INT")) return [...universe, ...maps, ...organic, ...ai];
  if (id.startsWith("LV-MAP")) return [...maps, ...universe];
  if (id.startsWith("LV-ORG")) return [...organic, ...universe];
  if (id.startsWith("LV-AI")) return [...ai, ...universe];
  if (id.startsWith("LV-CMP")) return [...maps, ...organic, ...ai, ...universe];
  if (id.startsWith("LV-AUT")) return [...authority];
  if (id.startsWith("LV-RES")) return [...maps, ...organic, ...ai, ...universe];
  return [];
}

export function deriveAudit(audit, rubric) {
  const metrics = computeMetrics(audit);
  const validity = evaluateValidity(audit);
  const checks = {};
  for (const item of rubric.items) {
    const applies = checkApplicability(item, audit);
    if (!applies.applicable) {
      checks[item.id] = {
        applicable: false,
        score: null,
        confidence: "not_applicable",
        needs_review: false,
        na_reason: applies.reason,
        evidence: [],
        evidence_refs: [],
      };
      continue;
    }
    if (item.evaluation === "deterministic") {
      const score = scoreFor(item.id, metrics);
      const refs = refsFor(item.id, audit);
      checks[item.id] = {
        applicable: true,
        score,
        confidence: "verified",
        needs_review: false,
        evidence: [evidenceFor(item.id, metrics)],
        evidence_refs: refs.length ? refs : (audit.sources || []).map((source) => source.id).slice(0, 1),
        notes: "Derived deterministically from normalized observations by metrics.mjs.",
      };
    } else {
      checks[item.id] = {
        applicable: true,
        score: null,
        confidence: "needs_review",
        needs_review: true,
        evidence: [],
        evidence_refs: [],
        notes: "Review the cited evidence, then record a score, evidence, evidence_refs, and confidence.",
      };
    }
  }
  const facts = {
    target_resolved: Boolean(audit.business?.resolution?.resolved),
    query_universe_locked: Boolean(audit.query_universe?.locked),
    non_branded_discovery_present: Boolean(metrics.coverage.non_branded_discovery_present),
    maps_observations_present: (audit.maps?.observations || []).length > 0,
    organic_observations_present: (audit.organic?.observations || []).length > 0,
    ai_observations_present: (audit.ai?.observations || []).length > 0,
    ai_surfaces_validated: (audit.ai?.surfaces || []).some((surface) => surface.validated && surface.available),
    competitor_cohort_locked: Boolean(audit.competitors?.locked),
    sufficient_valid_evidence: validity.passed,
  };
  return { metrics, validity, checks, facts };
}

export { rankCredit, labelFor, round };
