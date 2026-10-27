#!/usr/bin/env node
/**
 * Validate the repository's JSON Schemas and generated example artifacts.
 *
 * This is a deliberately small draft-2020-12 subset: the schemas in this repo
 * use types, required properties, enums, consts, arrays, patterns, bounds,
 * oneOf/anyOf/allOf, propertyNames, and local $refs. It is enough to catch
 * stale or malformed artifacts without adding a runtime dependency.
 *
 * Usage:
 *   node scripts/check_schemas.mjs [--example-dir examples/acme-plumbing]
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SKILL = path.join(ROOT, ".opencode", "skills", "home-service-local-visibility-audit");
const SCHEMA_DIR = path.join(SKILL, "references", "schema");
const HELP = `Local Visibility Scorecard — schema check

Usage:
  node scripts/check_schemas.mjs [--example-dir <dir>]

Validates:
  - raw-audit-v1, audit-v1, scores-v1, verification-v1, judgment-v1, query-universe-v1
  - the synthetic example's audit.raw.json, audit.filled.json, query-universe.json,
    judgment.json, scores.json, and verification.json

Exit 1 on malformed schemas or artifacts.
`;

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(HELP);
  process.exit(0);
}
const exampleIndex = process.argv.indexOf("--example-dir");
const exampleDir = path.resolve(exampleIndex === -1 ? path.join(ROOT, "examples", "acme-plumbing") : process.argv[exampleIndex + 1]);
const rawIndex = process.argv.indexOf("--raw-audit");
const rawAudit = rawIndex === -1 ? null : path.resolve(process.argv[rawIndex + 1]);

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const errors = [];
const stats = [];

function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  if (typeof value === "number") return "number";
  return typeof value;
}

function matchesType(value, expected) {
  const actual = typeOf(value);
  if (expected === "number") return actual === "number" || actual === "integer";
  return actual === expected;
}

function resolveRef(root, ref) {
  if (!ref.startsWith("#/")) throw new Error(`unsupported $ref: ${ref}`);
  let node = root;
  for (const segment of ref.slice(2).split("/")) {
    node = node?.[segment.replaceAll("~1", "/").replaceAll("~0", "~")];
  }
  if (!node) throw new Error(`unresolved $ref: ${ref}`);
  return node;
}

function validate(value, schema, root, pointer = "$") {
  if (!schema || typeof schema !== "object") return [];
  const found = [];
  if (schema.$ref) {
    return validate(value, resolveRef(root, schema.$ref), root, pointer);
  }
  if (schema.const !== undefined && value !== schema.const) {
    found.push(`${pointer}: expected const ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum && !schema.enum.includes(value)) {
    found.push(`${pointer}: value is not one of the allowed values`);
  }
  if (schema.type) {
    const expected = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!expected.some((type) => matchesType(value, type))) {
      found.push(`${pointer}: expected type ${expected.join("|")}, got ${typeOf(value)}`);
      return found;
    }
  }
  if (schema.oneOf) {
    const results = schema.oneOf.map((entry) => validate(value, entry, root, pointer));
    const matches = results.filter((entry) => entry.length === 0).length;
    if (matches !== 1) found.push(`${pointer}: oneOf matched ${matches} branches (expected 1)`);
    return found;
  }
  if (schema.anyOf) {
    const results = schema.anyOf.map((entry) => validate(value, entry, root, pointer));
    if (!results.some((entry) => entry.length === 0)) found.push(`${pointer}: no anyOf branch matched`);
    return found;
  }
  if (schema.allOf) {
    for (const entry of schema.allOf) found.push(...validate(value, entry, root, pointer));
  }
  if (schema.pattern && typeof value === "string" && !new RegExp(schema.pattern).test(value)) {
    found.push(`${pointer}: string does not match required pattern`);
  }
  if (schema.minLength !== undefined && typeof value === "string" && value.length < schema.minLength) {
    found.push(`${pointer}: string is shorter than ${schema.minLength}`);
  }
  if (schema.minimum !== undefined && typeof value === "number" && value < schema.minimum) {
    found.push(`${pointer}: number is below ${schema.minimum}`);
  }
  if (schema.maximum !== undefined && typeof value === "number" && value > schema.maximum) {
    found.push(`${pointer}: number is above ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) found.push(`${pointer}: fewer than ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) found.push(`${pointer}: more than ${schema.maxItems} items`);
    if (schema.items) value.forEach((entry, index) => found.push(...validate(entry, schema.items, root, `${pointer}[${index}]`)));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of schema.required || []) {
      if (!(key in value)) found.push(`${pointer}: missing required property ${key}`);
    }
    if (schema.propertyNames?.pattern) {
      const pattern = new RegExp(schema.propertyNames.pattern);
      for (const key of Object.keys(value)) {
        if (!pattern.test(key)) found.push(`${pointer}: property name ${key} does not match propertyNames`);
      }
    }
    for (const [key, entry] of Object.entries(value)) {
      if (schema.properties?.[key]) {
        found.push(...validate(entry, schema.properties[key], root, `${pointer}.${key}`));
        continue;
      }
      if (schema.patternProperties) {
        let matched = false;
        for (const [pattern, subSchema] of Object.entries(schema.patternProperties)) {
          if (new RegExp(pattern).test(key)) {
            matched = true;
            found.push(...validate(entry, subSchema, root, `${pointer}.${key}`));
          }
        }
        if (matched) continue;
      }
      if (schema.additionalProperties === false) {
        found.push(`${pointer}: additional property ${key} is not allowed`);
      } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        found.push(...validate(entry, schema.additionalProperties, root, `${pointer}.${key}`));
      }
    }
  }
  return found;
}

const schemaFiles = [
  "raw-audit-v1.schema.json",
  "audit-v1.schema.json",
  "scores-v1.schema.json",
  "verification-v1.schema.json",
  "judgment-v1.schema.json",
  "query-universe-v1.schema.json",
];
const schemas = {};
for (const file of schemaFiles) {
  const absolute = path.join(SCHEMA_DIR, file);
  try {
    schemas[file] = readJson(absolute);
    if (schemas[file].$schema !== "https://json-schema.org/draft/2020-12/schema") {
      errors.push(`${file}: unexpected $schema declaration`);
    }
    stats.push(`${file}: parsed`);
  } catch (error) {
    errors.push(`${file}: ${error.message}`);
  }
}

const examples = [
  ["audit.raw.json", "raw-audit-v1.schema.json"],
  ["audit.filled.json", "audit-v1.schema.json"],
  ["query-universe.json", "query-universe-v1.schema.json"],
  ["judgment.json", "judgment-v1.schema.json"],
  ["scores.json", "scores-v1.schema.json"],
  ["verification.json", "verification-v1.schema.json"],
];
for (const [file, schemaFile] of examples) {
  const absolute = path.join(exampleDir, file);
  if (!fs.existsSync(absolute)) {
    errors.push(`${path.relative(ROOT, absolute)}: missing example artifact`);
    continue;
  }
  try {
    const value = readJson(absolute);
    const found = validate(value, schemas[schemaFile], schemas[schemaFile]);
    if (found.length) {
      for (const item of found.slice(0, 20)) errors.push(`${file}: ${item}`);
      if (found.length > 20) errors.push(`${file}: ... ${found.length - 20} more`);
    } else {
      stats.push(`${file}: valid against ${schemaFile}`);
    }
  } catch (error) {
    errors.push(`${file}: ${error.message}`);
  }
}

if (rawAudit) {
  try {
    const value = readJson(rawAudit);
    const found = validate(value, schemas["raw-audit-v1.schema.json"], schemas["raw-audit-v1.schema.json"]);
    if (found.length) {
      for (const item of found.slice(0, 20)) errors.push(`${path.basename(rawAudit)}: ${item}`);
      if (found.length > 20) errors.push(`${path.basename(rawAudit)}: ... ${found.length - 20} more`);
    } else {
      stats.push(`${path.basename(rawAudit)}: valid against raw-audit-v1.schema.json`);
    }
  } catch (error) {
    errors.push(`${path.basename(rawAudit)}: ${error.message}`);
  }
}

// A credential can be hidden inside an otherwise schema-valid string field.
const forbiddenKeys = /^(?:api[_-]?key|apikey|authorization|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|cookie|set-cookie|dataforseo_login|dataforseo_password)$/i;
function scanKeys(value, pointer = "$") {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanKeys(entry, `${pointer}[${index}]`));
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (forbiddenKeys.test(key)) errors.push(`${pointer}.${key}: forbidden credential-like field`);
    scanKeys(entry, `${pointer}.${key}`);
  }
}
for (const [file] of examples) {
  const absolute = path.join(exampleDir, file);
  if (fs.existsSync(absolute)) {
    try {
      scanKeys(readJson(absolute), file);
    } catch {
      // Reported above.
    }
  }
}

for (const line of stats) console.log(`ok    ${line}`);
for (const error of [...new Set(errors)]) console.error(`FAIL  ${error}`);
if (errors.length) {
  console.error(`\n${errors.length} schema problem(s).`);
  process.exit(1);
}
console.log(`ok: ${schemaFiles.length} schemas and ${examples.length} example artifacts validate.`);
