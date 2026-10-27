#!/usr/bin/env node
/**
 * Build and lock a query universe before any ranking is collected.
 *
 *   node build_universe.mjs --config config/market.example.json --out query-universe.json
 *   node build_universe.mjs --config config/market.example.json --check query-universe.json
 *
 * Deterministic: the same configuration produces the same universe and hash.
 * This script performs no network access and reads no credentials.
 */

import fs from "node:fs";
import path from "node:path";
import { buildUniverse, canonicalJson, hashUniverse } from "./lib/universe.mjs";

const HELP = `Local Visibility Scorecard — query universe builder 1.0.0

Usage:
  node build_universe.mjs --config <market.json> [--out <json>]
  node build_universe.mjs --config <market.json> --check <universe.json>

Required:
  --config <json>       Market configuration (see config/market.example.json)

Optional:
  --out <json>          Write the locked universe here (default: stdout)
  --created-at <iso>    Deterministic created_at for a fixture
  --locked-at <iso>     Deterministic locked_at for a fixture
  --reviewer <name>     Reviewer label recorded in the universe
  --check <json>        Rebuild and compare with an existing universe
  --help

This stage does not collect rankings, call a provider, or read credentials.
`;

if (process.argv.includes("--help") || process.argv.includes("-h")) {
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
const configPath = arg("config");
if (!configPath || configPath === true) {
  console.error("error: --config is required");
  process.exit(2);
}
let config;
try {
  config = JSON.parse(fs.readFileSync(path.resolve(configPath), "utf8"));
} catch (error) {
  console.error(`error: could not read --config: ${error.message}`);
  process.exit(2);
}
let universe;
try {
  universe = buildUniverse(config, {
    createdAt: arg("created-at", undefined),
    lockedAt: arg("locked-at", undefined),
    reviewer: arg("reviewer", undefined),
  });
} catch (error) {
  console.error(`error: could not build the query universe: ${error.message}`);
  process.exit(1);
}

const checkPath = arg("check");
if (checkPath) {
  let existing;
  try {
    existing = JSON.parse(fs.readFileSync(path.resolve(checkPath), "utf8"));
  } catch (error) {
    console.error(`error: could not read --check universe: ${error.message}`);
    process.exit(2);
  }
  const rebuiltHash = hashUniverse(existing);
  const errors = [];
  if (existing.hash !== rebuiltHash) errors.push("stored hash does not match the universe content");
  if (existing.hash !== universe.hash) errors.push("stored universe differs from a fresh build");
  if (canonicalJson(existing.queries) !== canonicalJson(universe.queries)) errors.push("query set differs");
  if (canonicalJson(existing.prompts) !== canonicalJson(universe.prompts)) errors.push("prompt set differs");
  if (canonicalJson(existing.intents) !== canonicalJson(universe.intents)) errors.push("intent weights differ");
  if (errors.length) {
    for (const error of errors) console.error(`error: ${error}`);
    process.exit(1);
  }
  console.log(`ok: universe ${existing.universe_id} is locked and reproducible (${existing.hash})`);
  process.exit(0);
}

const outPath = arg("out");
const payload = JSON.stringify(universe, null, 2) + "\n";
if (outPath && outPath !== true) {
  const out = path.resolve(outPath);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, payload, "utf8");
  console.log(`wrote ${out}`);
} else {
  process.stdout.write(payload);
}
console.error(
  `universe ${universe.universe_id} · ${universe.services.length} services · ${universe.intents.length} intents · ` +
    `${universe.queries.filter((q) => q.role === "core").length} core queries · ${universe.prompts.length} prompts · ${universe.hash}`,
);
