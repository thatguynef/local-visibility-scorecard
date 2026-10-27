/**
 * DataForSEO Labs family adapters.
 *
 * Verified endpoint (2026-10-27):
 * - POST /v3/dataforseo_labs/google/keyword_overview/live
 *
 * Demand data is collected before the query universe is locked. CPC is stored
 * as demand context only; it is never treated as a ranking-quality signal.
 */

import { ProviderError } from "./client.mjs";

export const LABS_ENDPOINTS = {
  keyword_overview: "/v3/dataforseo_labs/google/keyword_overview/live",
};

export async function keywordOverview(client, params = {}) {
  const keywords = Array.isArray(params.keywords)
    ? params.keywords.map((keyword) => String(keyword).trim()).filter(Boolean).slice(0, 700)
    : [];
  if (!keywords.length) throw new ProviderError("keywords are required", { kind: "bad_request" });
  const task = {
    keywords,
    language_code: params.language_code || "en",
    include_serp_info: false,
  };
  if (params.location_code) task.location_code = Number(params.location_code);
  else if (params.location_name) task.location_name = String(params.location_name);
  else throw new ProviderError("a location_code or location_name is required", { kind: "bad_request" });
  return client.request(LABS_ENDPOINTS.keyword_overview, [task], { taskType: "labs_keyword_overview" });
}

/**
 * Normalize a Keyword Overview response into a demand map.
 * Returns lowercased keyword → { search_volume, cpc, trend, main_intent }.
 */
export function normalizeKeywordOverview(response) {
  const result = response?.result?.[0] || {};
  const output = new Map();
  for (const item of result.items || []) {
    const keyword = String(item.keyword || "").trim().toLowerCase();
    if (!keyword) continue;
    output.set(keyword, {
      search_volume: Number(item.keyword_info?.search_volume) || 0,
      cpc: Number(item.keyword_info?.cpc) || 0,
      trend: Number(item.keyword_info?.search_volume_trend?.yearly) || 0,
      main_intent: item.search_intent_info?.main_intent || "",
    });
  }
  return output;
}
