---
name: home-service-local-visibility-audit
description: Run the Local Visibility Scorecard for a local home-service business. Use when the task is to measure or explain local discovery across Search, Maps, AI answers, competitors, and external authority. Collect normalized observations, review the five judgment checks, score deterministically, render the one-page and full report, and verify the run. Do not use it to score GBP configuration or website conversion; route those to the sibling scorecards.
---

# Local Visibility Audit

## What this skill does

It measures whether prospective local customers can discover the business across the surfaces that matter:

- Search
- Google Maps and the Local Pack
- Google AI Mode (AI Overview adapter future)
- ChatGPT and other validated AI surfaces
- competitor share of visibility
- external authority and entity footprint
- visibility resilience

It produces a 0–100 score, a one-page report, a full evidence report, and machine-readable artifacts.

## Boundaries

- It does **not** score GBP category, services, reviews, photos, action paths, or profile-origin tracking. Route those to GBP Scorecard.
- It does **not** score page speed, mobile UX, forms, CTA usability, on-site schema, or website conversion tracking. Route those to Website Scorecard.
- It may identify which URL ranks. It does not judge whether that page converts.
- It never calls, texts, emails, submits a form, books, or changes a profile.
- It never commits a credential, raw provider response, real client report, geo-grid coordinate, or prompt log.

## Pipeline

```text
COLLECT → REVIEW → SCORE → RENDER → VERIFY
```

Each stage is independently runnable.

## Stage 1 — Collect

Fixture mode:

```sh
node scripts/collect.mjs \
  --fixture scripts/fixtures/acme-plumbing.raw.json \
  --out .audit/acme-plumbing/demo
```

Live mode:

```sh
export DATAFORSEO_LOGIN="..."
export DATAFORSEO_PASSWORD="..."
node scripts/collect.mjs --config config/market.example.json --plan
node scripts/collect.mjs --config config/market.example.json --run-id 2026-01-01T1000-acme
```

The collector writes a pending worksheet. Deterministic checks are pre-filled; judgment checks are pending.

## Stage 2 — Review

Fill the five judgment checks:

- `LV-ORG-05` — ranking URL relevance
- `LV-AI-04` — AI service relevance
- `LV-AI-05` — AI location relevance
- `LV-AI-06` — AI entity accuracy
- `LV-AUT-02` — local source relevance

Merge a structured proposal:

```sh
node scripts/apply_judgment.mjs \
  --audit .audit/acme/audit.json \
  --judgment .audit/acme/judgment.json \
  --out .audit/acme/audit.filled.json
```

Rules: only judgment checks, evidence references required, no invented sources, no deterministic changes.

## Stage 3 — Score

```sh
python3 scripts/score.py \
  --input .audit/acme/audit.filled.json \
  --out .audit/acme/scores.json \
  --strict
```

The scorer validates the audit, recomputes the universe hash, checks validity gates, removes N/A checks, normalizes weights, applies the single cap, and writes `scores.json`.

If a validity gate fails, the output is `INSUFFICIENT EVIDENCE`, not a low score.

## Stage 4 — Render

```sh
node scripts/render.mjs --scores scores.json --content content.json --out one-page.md
node scripts/render.mjs --mode full --scores scores.json --content content.json --out full-report.md
```

The renderer owns all tables, scores, the visibility matrix, geo-grid summary, AI breakdown, and provenance. `content.json` owns prose only.

## Stage 5 — Verify

```sh
node scripts/verify.mjs --run .audit/acme \
  --filled audit.filled.json --scores scores.json --content content.json \
  --report full-report.md --one-page one-page.md --out verification.json \
  --mutation --synthetic
```

The verifier recomputes metrics, deterministic check scores, and validity gates, then runs the mutation suite.

## Required artifacts

- `audit.json`
- `audit.filled.json`
- `query-universe.json`
- `judgment.json`
- `scores.json`
- `one-page.md`
- `full-report.md`
- `verification.json`

## Quality bar

A run is not finished unless:

- the target business resolved with confidence ≥ 0.80;
- the query universe was locked before collection;
- core queries are non-branded;
- Maps, Local Pack, and Local Finder are separate;
- AI source types are not pooled;
- the competitor cohort is locked;
- validity gates pass;
- deterministic checks are derived, not hand-waved;
- owner data is excluded from the score;
- the verifier passes with mutations;
- the example is synthetic or sanitized.

## Privacy

Never commit:

- DataForSEO credentials or Basic Authorization values;
- raw API responses from a real audit;
- a real client's query universe, grid coordinates, prompts, or competitor set;
- PII, reports, screenshots, Search Console exports, or revenue data.

Run:

```sh
npm run check:privacy
node scripts/privacy_scan.mjs --history
```

## Read next

- `references/rubric.json` — canonical 52-check rubric
- `references/rubric.md` — generated rubric
- `references/portable-checklist.md` — collection companion
- `references/fix-library.md` — deterministic fix mapping
- `references/schema/` — artifact schemas
- `docs/` — methodology and operations
