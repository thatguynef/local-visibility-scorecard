/**
 * AI Optimization family adapters.
 *
 * Verified endpoint (2026-10-27):
 * - POST /v3/ai_optimization/llm_mentions/search_mentions/live
 *
 * Google AI Mode consumer-surface observations come from serp.mjs. This module
 * is for model/API-generated mention data and is always labelled
 * source_type=model_api. The two source types are never pooled.
 *
 * LLM Responses endpoints are intentionally not implemented in V1 until their
 * current request shapes are validated against the official documentation and a
 * fixture. Do not guess an endpoint.
 */

import { ProviderError } from "./client.mjs";

export const AI_ENDPOINTS = {
  llm_mentions: "/v3/ai_optimization/llm_mentions/search_mentions/live",
};

export const SUPPORTED_LLM_MENTION_PLATFORMS = new Set(["google", "chat_gpt"]);

export async function llmMentions(client, params = {}) {
  const keyword = String(params.keyword || "").trim();
  if (!keyword) throw new ProviderError("a mention keyword or prompt is required", { kind: "bad_request" });
  const platform = params.platform || "chat_gpt";
  if (!SUPPORTED_LLM_MENTION_PLATFORMS.has(platform)) {
    throw new ProviderError(
      `LLM Mentions supports platforms ${[...SUPPORTED_LLM_MENTION_PLATFORMS].join(", ")}; received ${platform}`,
      { kind: "bad_request" },
    );
  }
  const task = {
    target: [
      {
        keyword,
        search_filter: "include",
        search_scope: ["question", "answer"],
        match_type: "partial_match",
      },
    ],
    platform,
    language_code: params.language_code || "en",
    limit: Math.max(1, Math.min(100, Number(params.limit) || 10)),
  };
  if (params.location_code) task.location_code = Number(params.location_code);
  else if (params.location_name) task.location_name = String(params.location_name);
  else task.location_code = 2840;
  return client.request(AI_ENDPOINTS.llm_mentions, [task], { taskType: "llm_mentions" });
}
