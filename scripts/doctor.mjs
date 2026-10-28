#!/usr/bin/env node
/** Check the local toolchain for a Local Visibility Scorecard run. */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const HELP = `Local Visibility Scorecard — doctor

Usage:
  node scripts/doctor.mjs

Checks Node, Python, git, the docs toolchain, the synthetic fixture, and whether
DataForSEO credentials are present. It never prints the value of an environment
variable.
`;

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(HELP);
  process.exit(0);
}

const rows = [];
const add = (name, ok, detail, required = true) => rows.push({ name, ok, detail, required });
const version = (command, args) => {
  try {
    return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
};

const nodeVersion = process.versions.node;
const nodeMajor = Number(nodeVersion.split(".")[0]);
add("Node.js", nodeMajor >= 22, `v${nodeVersion}${nodeMajor >= 22 ? "" : " (need 22+)"}`);

const python = version("python3", ["--version"]);
const pythonVersion = python?.replace(/^Python\s+/i, "") || "";
const [pythonMajor, pythonMinor] = pythonVersion.split(".").map(Number);
add("Python", Boolean(python) && (pythonMajor > 3 || (pythonMajor === 3 && pythonMinor >= 10)), python || "python3 not found");

add("git", Boolean(version("git", ["--version"])), version("git", ["--version"]) || "not found");
const hasLogin = Boolean(process.env.DATAFORSEO_LOGIN);
const hasPassword = Boolean(process.env.DATAFORSEO_PASSWORD);
const hasBasicAuth = Boolean(process.env.DATAFORSEO_BASIC_AUTH);
const hasCredentials = (hasLogin && hasPassword) || hasBasicAuth;
add(
  "DataForSEO credentials",
  hasCredentials,
  hasCredentials ? "present in environment (values not printed)" : "not set; fixture mode needs none",
  false,
);
const fixture = path.join(
  process.cwd(),
  ".opencode",
  "skills",
  "home-service-local-visibility-audit",
  "scripts",
  "fixtures",
  "acme-plumbing.raw.json",
);
add("Synthetic fixture", fs.existsSync(fixture), fs.existsSync(fixture) ? "present" : "missing", true);
const example = path.join(process.cwd(), "examples", "acme-plumbing", "scores.json");
add("Example artifacts", fs.existsSync(example), fs.existsSync(example) ? "present" : "missing", false);

const venvDocs = fs.existsSync(path.join(process.cwd(), ".venv-docs", "bin", "python"));
const systemMkdocs = version("python3", ["-m", "mkdocs", "--version"]);
add(
  "Docs toolchain",
  Boolean(systemMkdocs) || venvDocs,
  systemMkdocs || (venvDocs ? "available in .venv-docs (docs:build will use it)" : "mkdocs not installed (optional for audits; needed for docs:build)"),
  false,
);

for (const row of rows) {
  console.log(`${row.ok ? "ok  " : row.required ? "FAIL" : "warn"}  ${row.name.padEnd(22)} ${row.detail}`);
}
const failures = rows.filter((row) => row.required && !row.ok);
console.log("");
if (failures.length) {
  console.log(`Fix ${failures.length} required tool(s) before running an audit.`);
  process.exit(1);
}
console.log("Ready. Run: npm run audit -- --help");
