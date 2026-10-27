/**
 * Deterministic geo-grid generation.
 *
 * A grid is configured before collection. The delivered-audit default is 7x7 /
 * 49 points. The generation method, center, radius, point coordinates, version,
 * and hash are recorded so a historical grid can be reproduced.
 *
 * Synthetic fixtures only in tracked examples. Real client coordinates stay
 * local.
 */

import crypto from "node:crypto";
import { canonicalJson } from "./universe.mjs";

export const GRID_VERSION = "1.0.0";
export const DEFAULT_GRID_SIZE = 7;
export const DEFAULT_GRID_RADIUS_KM = 10;

const roundCoord = (value, digits = 6) => Number(Number(value).toFixed(digits));

export function buildGrid({
  center,
  radius_km = DEFAULT_GRID_RADIUS_KM,
  size = DEFAULT_GRID_SIZE,
  generation_method = "square_grid_v1",
  coordinate_digits = 6,
} = {}) {
  const lat = Number(center?.lat);
  const lng = Number(center?.lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error("grid center latitude is invalid");
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error("grid center longitude is invalid");
  const gridSize = Number(size);
  if (!Number.isInteger(gridSize) || gridSize < 3 || gridSize > 15) {
    throw new Error("grid size must be an integer from 3 to 15");
  }
  const radius = Number(radius_km);
  if (!Number.isFinite(radius) || radius <= 0 || radius > 500) {
    throw new Error("grid radius must be greater than 0 and at most 500 km");
  }
  if (generation_method !== "square_grid_v1") {
    throw new Error(`unsupported grid generation method: ${generation_method}`);
  }
  const latSpan = radius / 111.32;
  const lngSpan = radius / (111.32 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  const offset = (gridSize - 1) / 2;
  const points = [];
  let index = 1;
  for (let row = 0; row < gridSize; row += 1) {
    for (let column = 0; column < gridSize; column += 1) {
      const pointLat = roundCoord(lat + (row - offset) * (latSpan / offset), coordinate_digits);
      const pointLng = roundCoord(lng + (column - offset) * (lngSpan / offset), coordinate_digits);
      points.push({
        point_id: `G${String(index).padStart(2, "0")}`,
        lat: pointLat,
        lng: pointLng,
        row,
        column,
      });
      index += 1;
    }
  }
  const grid = {
    id: `grid-${gridSize}x${gridSize}-${String(Math.abs(lat)).replace(".", "")}-${String(Math.abs(lng)).replace(".", "")}`,
    size: gridSize,
    points: points.length,
    radius_km: radius,
    center: { lat: roundCoord(lat, coordinate_digits), lng: roundCoord(lng, coordinate_digits) },
    generation_method,
    version: GRID_VERSION,
    hash: `sha256:${crypto.createHash("sha256").update(canonicalJson({ size: gridSize, radius_km: radius, center: { lat, lng }, generation_method, points })).digest("hex")}`,
    coordinate_digits,
  };
  return { grid, points };
}

export function quadrantOf(point, center) {
  const north = Number(point.lat) >= Number(center.lat);
  const east = Number(point.lng) >= Number(center.lng);
  if (north && east) return "NE";
  if (north && !east) return "NW";
  if (!north && east) return "SE";
  return "SW";
}
