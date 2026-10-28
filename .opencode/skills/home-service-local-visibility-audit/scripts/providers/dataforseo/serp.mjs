/**
 * SERP API family adapters.
 *
 * Endpoint shapes verified against the current official DataForSEO
 * documentation (2026-10-27):
 * - /v3/serp/google/organic/live/advanced
 * - /v3/serp/google/maps/live/advanced
 * - /v3/serp/google/local_finder/live/advanced
 * - /v3/serp/google/ai_mode/live/advanced
 *
 * Each live request carries exactly one task. The client owns retries,
 * timeouts, cache, concurrency, and cost tracking.
 */

import { ProviderError } from "./client.mjs";

export const SERP_ENDPOINTS = {
  google_organic: "/v3/serp/google/organic/live/advanced",
  google_maps: "/v3/serp/google/maps/live/advanced",
  google_local_finder: "/v3/serp/google/local_finder/live/advanced",
  google_ai_mode: "/v3/serp/google/ai_mode/live/advanced",
};

const DEVICE = new Set(["desktop", "mobile"]);

function requireKeyword(keyword, label = "keyword") {
  if (typeof keyword !== "string" || !keyword.trim()) {
    throw new ProviderError(`${label} is required`, { kind: "bad_request" });
  }
  return keyword.trim();
}

function requireLocation(task) {
  if (!task.location_code && !task.location_name && !task.location_coordinate) {
    throw new ProviderError("a location_code, location_name, or location_coordinate is required", {
      kind: "bad_request",
    });
  }
}

function deviceOf(value) {
  return DEVICE.has(value) ? value : "mobile";
}

export function coordinate(lat, lng, zoom = 14, minZoom = 3, maxZoom = 21) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new ProviderError("latitude must be between -90 and 90", { kind: "bad_request" });
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new ProviderError("longitude must be between -180 and 180", { kind: "bad_request" });
  }
  // Each Google SERP endpoint has its own documented zoom range. Defaults are
  // the Maps range; callers pass the narrower AI Mode / Local Finder bounds.
  const zoomValue = Math.max(minZoom, Math.min(maxZoom, Math.round(Number(zoom) || 14)));
  return `${latitude.toFixed(6)},${longitude.toFixed(6)},${zoomValue}z`;
}

export async function googleOrganic(client, params = {}) {
  const task = {
    keyword: requireKeyword(params.keyword),
    language_code: params.language_code || "en",
    device: deviceOf(params.device),
    depth: Math.max(10, Math.min(100, Number(params.depth) || 20)),
    load_async_ai_overview: params.load_async_ai_overview === true,
  };
  if (params.location_code) task.location_code = Number(params.location_code);
  if (params.location_name) task.location_name = String(params.location_name);
  if (params.location_coordinate) task.location_coordinate = String(params.location_coordinate);
  requireLocation(task);
  return client.request(SERP_ENDPOINTS.google_organic, [task], { taskType: "serp_google_organic" });
}

export async function googleMaps(client, params = {}) {
  const task = {
    keyword: requireKeyword(params.keyword),
    language_code: params.language_code || "en",
    device: deviceOf(params.device),
    depth: Math.max(10, Math.min(100, Number(params.depth) || 20)),
    // DataForSEO warns that search_places mode can return results for a
    // different location than the requested coordinate. Grid collection is
    // explicitly local-intent work, so opt in only when a caller asks for it.
    search_places: params.search_places === true,
    search_this_area: params.search_this_area !== false,
  };
  if (params.location_coordinate) {
    task.location_coordinate = String(params.location_coordinate);
  } else if (params.lat !== undefined && params.lng !== undefined) {
    task.location_coordinate = coordinate(params.lat, params.lng, params.zoom || 14, 3, 21);
  } else if (params.location_code) {
    task.location_code = Number(params.location_code);
  } else {
    throw new ProviderError("Google Maps requires a location_coordinate or location_code", { kind: "bad_request" });
  }
  return client.request(SERP_ENDPOINTS.google_maps, [task], { taskType: "serp_google_maps" });
}

export async function googleLocalFinder(client, params = {}) {
  const task = {
    keyword: requireKeyword(params.keyword),
    language_code: params.language_code || "en",
    device: deviceOf(params.device),
    depth: Math.max(10, Math.min(100, Number(params.depth) || 20)),
  };
  if (params.location_coordinate) {
    task.location_coordinate = String(params.location_coordinate);
  } else if (params.lat !== undefined && params.lng !== undefined) {
    task.location_coordinate = coordinate(params.lat, params.lng, params.zoom || 14, 4, 18);
  } else if (params.location_code) {
    task.location_code = Number(params.location_code);
  } else {
    throw new ProviderError("Local Finder requires a location_coordinate or location_code", { kind: "bad_request" });
  }
  return client.request(SERP_ENDPOINTS.google_local_finder, [task], { taskType: "serp_google_local_finder" });
}

export async function googleAiMode(client, params = {}) {
  const task = {
    keyword: requireKeyword(params.keyword, "prompt"),
    language_code: params.language_code || "en",
    device: deviceOf(params.device),
  };
  if (params.location_coordinate) {
    task.location_coordinate = String(params.location_coordinate);
  } else if (params.lat !== undefined && params.lng !== undefined) {
    // AI Mode documents a 4z-18z zoom range.
    task.location_coordinate = coordinate(params.lat, params.lng, params.zoom || 15, 4, 18);
  } else if (params.location_code) {
    task.location_code = Number(params.location_code);
  } else {
    throw new ProviderError("Google AI Mode requires a location_coordinate or location_code", { kind: "bad_request" });
  }
  return client.request(SERP_ENDPOINTS.google_ai_mode, [task], { taskType: "serp_google_ai_mode" });
}
