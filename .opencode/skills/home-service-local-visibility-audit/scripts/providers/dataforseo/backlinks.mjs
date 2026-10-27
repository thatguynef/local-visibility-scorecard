/**
 * Backlinks family adapters.
 *
 * Verified endpoints (2026-10-27):
 * - POST /v3/backlinks/summary/live
 * - POST /v3/backlinks/referring_domains/live
 *
 * Raw link counts are not scored. The normalized audit records referring
 * domains with a source-relevance classification so the score can use
 * relevance rather than raw quantity.
 */

import { ProviderError } from "./client.mjs";

export const BACKLINK_ENDPOINTS = {
  summary: "/v3/backlinks/summary/live",
  referring_domains: "/v3/backlinks/referring_domains/live",
};

function requireTarget(target) {
  const value = String(target || "").trim();
  if (!value) throw new ProviderError("a backlinks target is required", { kind: "bad_request" });
  return value.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "");
}

export async function backlinksSummary(client, params = {}) {
  const task = {
    target: requireTarget(params.target),
    include_subdomains: true,
    exclude_internal_backlinks: true,
    backlinks_status_type: "live",
    rank_scale: "one_hundred",
  };
  return client.request(BACKLINK_ENDPOINTS.summary, [task], { taskType: "backlinks_summary" });
}

export async function referringDomains(client, params = {}) {
  const task = {
    target: requireTarget(params.target),
    limit: Math.max(1, Math.min(1000, Number(params.limit) || 100)),
    exclude_internal_backlinks: true,
    backlinks_status_type: "live",
    rank_scale: "one_hundred",
    order_by: ["rank,desc"],
  };
  return client.request(BACKLINK_ENDPOINTS.referring_domains, [task], { taskType: "backlinks_referring_domains" });
}
