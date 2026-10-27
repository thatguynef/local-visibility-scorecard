/**
 * Business Data family adapters.
 *
 * Verified endpoint (2026-10-27):
 * - POST /v3/business_data/business_listings/search/live
 *
 * Used for target resolution and external listing consistency. It is not used
 * to score GBP configuration; that belongs to GBP Scorecard.
 */

import { ProviderError } from "./client.mjs";

export const BUSINESS_DATA_ENDPOINTS = {
  business_listings_search: "/v3/business_data/business_listings/search/live",
};

export async function businessListingsSearch(client, params = {}) {
  const title = String(params.title || "").trim();
  if (!title) throw new ProviderError("a business title is required", { kind: "bad_request" });
  const lat = Number(params.center?.lat);
  const lng = Number(params.center?.lng);
  const radius = Math.max(1, Math.min(100000, Number(params.radius_km) || 10));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new ProviderError("a center latitude and longitude are required", { kind: "bad_request" });
  }
  const task = {
    title,
    location_coordinate: `${lat.toFixed(6)},${lng.toFixed(6)},${radius}`,
    limit: Math.max(1, Math.min(50, Number(params.limit) || 10)),
  };
  return client.request(BUSINESS_DATA_ENDPOINTS.business_listings_search, [task], {
    taskType: "business_listings_search",
  });
}
