#!/usr/bin/env node
/** Offline pipeline tests for the Local Visibility Scorecard. */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildUniverse } from "./lib/universe.mjs";

const HERE = import.meta.dirname;
const ROOT = path.resolve(HERE, "..", "..", "..", "..");
const RUBRIC = path.join(HERE, "..", "references", "rubric.json");
const CONFIG = path.join(ROOT, "config", "market.example.json");
const FIXTURE = path.join(HERE, "fixtures", "acme-plumbing.audit.json");
const RAW_FIXTURE = path.join(HERE, "fixtures", "acme-plumbing.raw.json");
const JUDGMENT = path.join(HERE, "fixtures", "acme-plumbing.judgment.json");
const EXAMPLE = path.join(ROOT, "examples", "acme-plumbing");
const COLLECT = path.join(HERE, "collect.mjs");
const UNIVERSE = path.join(HERE, "build_universe.mjs");
const SCORE = path.join(HERE, "score.py");
const RENDER = path.join(HERE, "render.mjs");
const VERIFY = path.join(HERE, "verify.mjs");
const JUDGE = path.join(HERE, "apply_judgment.mjs");
const PRIVACY = path.join(ROOT, "scripts", "privacy_scan.mjs");
const SCHEMAS = path.join(ROOT, "scripts", "check_schemas.mjs");

const temp = (label) => fs.mkdtempSync(path.join(os.tmpdir(), `lv-${label}-`));
const run = (command, args, options = {}) =>
  spawnSync(command, args, { encoding: "utf8", cwd: ROOT, ...options });

test("rubric validator accepts the canonical rubric", () => {
  const result = run("python3", [path.join(HERE, "validate_rubric.py")]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /52 checks/);
});

test("golden fixture scores 60 / C and is deterministic", () => {
  const dir = temp("score");
  try {
    const outA = path.join(dir, "a.json");
    const outB = path.join(dir, "b.json");
    for (const out of [outA, outB]) {
      const result = run("python3", [SCORE, "--input", FIXTURE, "--rubric", RUBRIC, "--out", out, "--strict"]);
      assert.equal(result.status, 0, result.stderr);
    }
    assert.equal(fs.readFileSync(outA, "utf8"), fs.readFileSync(outB, "utf8"));
    const scores = JSON.parse(fs.readFileSync(outA, "utf8"));
    assert.equal(scores.display, 60);
    assert.equal(scores.band, "C");
    assert.equal(scores.total, 59.9);
    assert.equal(scores.final, 59.9);
    assert.equal(scores.ownerDataRequired.length, 9);
    assert.ok(scores.ownerDataRequired.every((entry) => entry.publicScoreImpact === "none"));
    assert.equal(scores.normalization.na_checks.length, 2);
    assert.ok(scores.query_universe_hash.startsWith("sha256:"));
    assert.equal(scores.visibilityMatrix.length, 6);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("query universe is deterministic, locked, and reproducible", () => {
  const config = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
  const options = { createdAt: "2026-01-01T00:00:00Z", lockedAt: "2026-01-01T00:00:00Z", reviewer: "test" };
  const a = buildUniverse(config, options);
  const b = buildUniverse(config, options);
  assert.equal(a.hash, b.hash);
  assert.ok(a.hash.startsWith("sha256:"));
  assert.equal(a.locked, true);
  assert.equal(a.services.length, 6);
  assert.equal(a.queries.filter((query) => query.role === "core").length, 30);
  assert.equal(a.queries.filter((query) => query.grid === true).length, 8);
  assert.equal(a.prompts.length, 16);
  assert.ok(a.queries.filter((query) => query.role === "core").every((query) => query.brand === "non_brand"));
  assert.ok(Math.abs(a.intents.filter((intent) => intent.core && intent.brand === "non_brand").reduce((sum, intent) => sum + intent.weight, 0) - 1) < 0.02);

  const dir = temp("universe");
  try {
    const out = path.join(dir, "universe.json");
    let result = run(process.execPath, [UNIVERSE, "--config", CONFIG, "--out", out, "--created-at", "2026-01-01T00:00:00Z", "--locked-at", "2026-01-01T00:00:00Z", "--reviewer", "test"]);
    assert.equal(result.status, 0, result.stderr);
    result = run(process.execPath, [UNIVERSE, "--config", CONFIG, "--check", out]);
    assert.equal(result.status, 0, result.stderr);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("fixture collector needs no credentials and emits a pending worksheet", () => {
  const dir = temp("collect");
  try {
    const out = path.join(dir, "run");
    const env = { ...process.env };
    delete env.DATAFORSEO_LOGIN;
    delete env.DATAFORSEO_PASSWORD;
    const result = run(process.execPath, [COLLECT, "--fixture", RAW_FIXTURE, "--out", out, "--run-id", "test-run"], { env });
    assert.equal(result.status, 0, result.stderr);
    const audit = JSON.parse(fs.readFileSync(path.join(out, "audit.json"), "utf8"));
    assert.equal(audit.run.source_mode, "fixture");
    assert.equal(audit.run.synthetic, true);
    assert.equal(audit.review.status, "pending");
    assert.equal(Object.keys(audit.checks).length, 52);
    assert.equal(audit.maps.observations.length, 784);
    assert.equal(audit.organic.observations.length, 32);
    assert.equal(audit.ai.observations.length, 48);
    assert.equal(audit.query_universe.locked, true);
    assert.ok(audit.query_universe.hash.startsWith("sha256:"));
    assert.ok(audit.checks["LV-MAP-01"].score !== null);
    assert.equal(audit.checks["LV-ORG-05"].needs_review, true);
    assert.equal(audit.checks["LV-MAP-10"].applicable, false);
    assert.equal(audit.checks["LV-RES-05"].applicable, false);
    assert.ok(audit.validity.gates.every((gate) => gate.passed));
    assert.ok(fs.existsSync(path.join(out, "query-universe.json")));
    assert.ok(fs.existsSync(path.join(out, "metrics.json")));
    const schema = run(process.execPath, [SCHEMAS, "--raw-audit", path.join(out, "audit.json")]);
    assert.equal(schema.status, 0, schema.stderr + schema.stdout);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("live mode fails clearly without credentials and writes no audit", () => {
  const dir = temp("live");
  try {
    const env = { ...process.env };
    delete env.DATAFORSEO_LOGIN;
    delete env.DATAFORSEO_PASSWORD;
    const result = run(process.execPath, [COLLECT, "--config", CONFIG, "--out", path.join(dir, "run"), "--run-id", "test"], { env });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /DATAFORSEO_(LOGIN|PASSWORD)|credentials are not set/);
    assert.ok(!fs.existsSync(path.join(dir, "run", "audit.json")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("dry-run plan sends no paid request and writes no audit", () => {
  const dir = temp("plan");
  try {
    const out = path.join(dir, "run");
    const env = { ...process.env };
    delete env.DATAFORSEO_LOGIN;
    delete env.DATAFORSEO_PASSWORD;
    const result = run(process.execPath, [COLLECT, "--config", CONFIG, "--plan", "--out", out, "--run-id", "test"], { env });
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stdout, /Core keywords/);
    assert.match(result.stdout, /Safety ceilings/);
    const plan = JSON.parse(fs.readFileSync(path.join(out, "plan.json"), "utf8"));
    assert.equal(plan.total_task_count > 0, true);
    assert.equal(plan.over_budget, false);
    assert.ok(!fs.existsSync(path.join(out, "audit.json")));
    assert.ok(!fs.existsSync(path.join(out, "query-universe.json")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("renderer produces the one-pager and full report from structured scores", () => {
  const dir = temp("render");
  try {
    const onePage = path.join(dir, "one-page.md");
    const report = path.join(dir, "full-report.md");
    let result = run(process.execPath, [RENDER, "--scores", path.join(EXAMPLE, "scores.json"), "--content", path.join(EXAMPLE, "content.json"), "--out", onePage]);
    assert.equal(result.status, 0, result.stderr);
    result = run(process.execPath, [RENDER, "--mode", "full", "--scores", path.join(EXAMPLE, "scores.json"), "--content", path.join(EXAMPLE, "content.json"), "--out", report]);
    assert.equal(result.status, 0, result.stderr);
    const oneText = fs.readFileSync(onePage, "utf8");
    const fullText = fs.readFileSync(report, "utf8");
    assert.match(oneText, /^# 60 \/ 100/m);
    assert.match(oneText, /VERIFIED/);
    assert.match(oneText, /Signature visibility matrix/);
    assert.match(oneText, /Geo-grid findings|Visibility snapshot/);
    assert.match(fullText, /STRONG SIGNAL/);
    assert.match(fullText, /Geo-grid findings/);
    assert.match(fullText, /AI visibility/);
    assert.equal([...fullText.matchAll(/^\| LV-/gm)].length, 52);
    assert.ok(oneText.split(/\s+/).filter(Boolean).length <= 1200);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("verifier passes the synthetic example with mutations and fixture checks", () => {
  const dir = temp("verify");
  try {
    const out = path.join(dir, "verification.json");
    const result = run(process.execPath, [
      VERIFY,
      "--run", EXAMPLE,
      "--filled", path.join(EXAMPLE, "audit.filled.json"),
      "--scores", path.join(EXAMPLE, "scores.json"),
      "--content", path.join(EXAMPLE, "content.json"),
      "--report", path.join(EXAMPLE, "full-report.md"),
      "--one-page", path.join(EXAMPLE, "one-page.md"),
      "--out", out,
      "--mutation", "--fixture", "--synthetic",
    ]);
    assert.equal(result.status, 0, result.stderr + result.stdout);
    const record = JSON.parse(fs.readFileSync(out, "utf8"));
    assert.equal(record.result, "pass");
    assert.equal(record.mutation_tests, "pass");
    assert.equal(record.fixture.pass, true);
    assert.equal(record.score, 60);
    assert.ok(record.checks.I35);
    assert.ok(record.checks.I36);
    assert.ok(record.checks.I37);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("judgment merger accepts only applicable judgment checks", () => {
  const dir = temp("judgment");
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(EXAMPLE, "audit.raw.json"), "utf8"));
    const input = path.join(dir, "audit.json");
    const out = path.join(dir, "reviewed.json");
    fs.writeFileSync(input, JSON.stringify(raw), "utf8");
    const ok = run(process.execPath, [JUDGE, "--audit", input, "--judgment", JUDGMENT, "--out", out]);
    assert.equal(ok.status, 0, ok.stderr);
    const reviewed = JSON.parse(fs.readFileSync(out, "utf8"));
    assert.equal(reviewed.checks["LV-AI-04"].score, 2);
    assert.equal(reviewed.checks["LV-AI-04"].review.method, "model_judgment");
    assert.equal(reviewed.review.status, "complete");

    const proposal = path.join(dir, "bad.json");
    fs.writeFileSync(proposal, JSON.stringify({
      schema_version: "1.0",
      audit_mode: "public",
      model: { name: "synthetic-reviewer" },
      checks: {
        "LV-MAP-01": {
          score: 3,
          confidence: "verified",
          evidence: ["Deterministic test."],
          evidence_refs: ["google-local-pack"],
        },
      },
    }), "utf8");
    const bad = run(process.execPath, [JUDGE, "--audit", input, "--judgment", proposal, "--out", out, "--allow-partial"]);
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /deterministic check cannot be model-judged/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("privacy scanner fails on synthetic DataForSEO credentials and never prints them", () => {
  const dir = temp("privacy-bad");
  try {
    const password = "syntheticDataForSeoPassword123";
    const basic = Buffer.from("synthetic-login:synthetic-password").toString("base64");
    fs.writeFileSync(path.join(dir, "leak.md"), `DATAFORSEO_PASSWORD=${password}\nAuthorization: Basic ${basic}\n`, "utf8");
    const result = run(process.execPath, [PRIVACY, "--dir", dir]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /DataForSEO|authorization/i);
    assert.ok(!result.stderr.includes(password), "scanner must redact the value");
    assert.ok(!result.stdout.includes(password), "scanner must redact the value");
    assert.ok(!result.stderr.includes(basic), "scanner must redact the Basic value");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("privacy scanner passes a clean synthetic directory", () => {
  const dir = temp("privacy-clean");
  try {
    fs.writeFileSync(path.join(dir, "notes.md"), "Synthetic business. Phone (555) 010-0200. Email hello@example.com. No credentials.\n", "utf8");
    const result = run(process.execPath, [PRIVACY, "--dir", dir]);
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stdout, /no hard privacy findings/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("repository privacy scan and schema check pass", () => {
  const privacy = run(process.execPath, [PRIVACY]);
  assert.equal(privacy.status, 0, privacy.stderr + privacy.stdout);
  const schemas = run(process.execPath, [SCHEMAS]);
  assert.equal(schemas.status, 0, schemas.stderr + schemas.stdout);
});

test("score.py rejects a malformed audit without writing a score", () => {
  const dir = temp("bad-audit");
  try {
    const audit = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
    audit.checks["LV-MAP-01"].evidence_refs = ["unknown-source"];
    const input = path.join(dir, "audit.json");
    const out = path.join(dir, "scores.json");
    fs.writeFileSync(input, JSON.stringify(audit), "utf8");
    const result = run("python3", [SCORE, "--input", input, "--out", out, "--strict"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unknown source/);
    assert.ok(!fs.existsSync(out));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
