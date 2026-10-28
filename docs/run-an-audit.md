---
description: "Run a fixture or live Local Visibility Scorecard audit: collect, review, score, render, and verify, with cost controls and privacy rules."
---

# Run an audit

Requirements: Node.js 22+, Python 3.10+, and git. There are no runtime npm dependencies.

```sh
git clone https://github.com/thatguynef/local-visibility-scorecard.git
cd local-visibility-scorecard
npm run doctor
npm test
npm run verify:example
```

## 1. Run the synthetic fixture first

The fixture needs no credentials and makes no network request.

```sh
npm run collect -- \
  --fixture .opencode/skills/home-service-local-visibility-audit/scripts/fixtures/acme-plumbing.raw.json \
  --out .audit/acme-plumbing/demo \
  --run-id demo
```

The collector writes a **pending worksheet**:

- `audit.json` — normalized observations and all 52 checks; deterministic checks are pre-filled, judgment checks are pending;
- `query-universe.json` — the locked universe;
- `run.json` — the manifest;
- `metrics.json` — the deterministic metrics.

## 2. Review the judgment checks

Open `audit.json`. The five pending checks are:

- `LV-ORG-05` — ranking URL relevance;
- `LV-AI-04` — service relevance;
- `LV-AI-05` — location relevance;
- `LV-AI-06` — entity accuracy;
- `LV-AUT-02` — local source relevance.

Write a `judgment.json` proposal and merge it:

```sh
node .opencode/skills/home-service-local-visibility-audit/scripts/apply_judgment.mjs \
  --audit .audit/acme-plumbing/demo/audit.json \
  --judgment .audit/acme-plumbing/demo/judgment.json \
  --out .audit/acme-plumbing/demo/audit.filled.json
```

For a real audit, you can also fill the checks directly in `audit.filled.json`. Every applicable check needs a score, evidence, evidence references, and confidence.

## 3. Score

```sh
npm run score -- \
  --input .audit/acme-plumbing/demo/audit.filled.json \
  --out .audit/acme-plumbing/demo/scores.json \
  --markdown .audit/acme-plumbing/demo/scorecard.md \
  --strict
```

If the run is incomplete, the scorer prints `INSUFFICIENT EVIDENCE` and writes no score. Read the failed gate before changing the audit. Do not lower a check to compensate for a missing observation.

## 4. Write the report content

The renderer owns the tables, scores, matrix, and provenance. `content.json` owns the prose:

- verdict,
- three gaps,
- strengths,
- fixes and effort,
- journey notes,
- owner-data questions,
- opportunity flags,
- limitations,
- next steps.

See `examples/acme-plumbing/content.json` for the shape.

## 5. Render

```sh
npm run render -- \
  --scores .audit/acme-plumbing/demo/scores.json \
  --content .audit/acme-plumbing/demo/content.json \
  --out .audit/acme-plumbing/demo/one-page.md

npm run render -- --mode full \
  --scores .audit/acme-plumbing/demo/scores.json \
  --content .audit/acme-plumbing/demo/content.json \
  --out .audit/acme-plumbing/demo/full-report.md
```

## 6. Verify

```sh
node .opencode/skills/home-service-local-visibility-audit/scripts/verify.mjs \
  --run .audit/acme-plumbing/demo \
  --filled .audit/acme-plumbing/demo/audit.filled.json \
  --scores .audit/acme-plumbing/demo/scores.json \
  --content .audit/acme-plumbing/demo/content.json \
  --report .audit/acme-plumbing/demo/full-report.md \
  --one-page .audit/acme-plumbing/demo/one-page.md \
  --out .audit/acme-plumbing/demo/verification.json \
  --mutation --synthetic
```

The verifier recomputes the score, metrics, deterministic checks, and validity gates. It also runs the mutation suite. If a mutation survives, verification fails.

## Live Public Mode

### 1. Export credentials

```sh
export DATAFORSEO_LOGIN="..."
export DATAFORSEO_PASSWORD="..."
```

Or use a pre-encoded Base64 `login:password` value:

```sh
export DATAFORSEO_BASIC_AUTH="Basic <base64-login-password>"
```

The client accepts either the bare Base64 value or a full `Basic ...` header and validates that it decodes to `login:password`. Base64 is not encryption; treat it as a credential.

The application never reads `.env` automatically. Never put a real value in a tracked file.

### 2. Plan the run

```sh
npm run audit -- \
  --config config/market.example.json \
  --plan
```

The plan shows core keywords, grid points, Maps tasks, organic tasks, AI prompt tasks, competitor and authority tasks, total task count, and the configured ceilings.

Preflight also refuses a configuration that cannot produce a valid audit: fewer than two locked business competitors, an unsupported AI surface, or ChatGPT on a non-US market. These checks happen before any Maps or organic request.

`--dry-run` is equivalent and sends no paid request.

### 3. Run the audit

```sh
npm run audit -- \
  --config config/market.example.json \
  --run-id 2026-01-01T1000-acme
```

The wrapper creates the raw run and the report directory, then prints the score/render/verify commands.

### Cost and request controls

| Flag | Meaning |
|---|---|
| `--max-serp-tasks` | SERP task ceiling |
| `--max-ai-tasks` | AI task ceiling |
| `--max-cost-usd` | Cost ceiling; requires `--pricing` |
| `--pricing` | Local pricing file with real contracted prices |
| `--grid-size` | 3, 5, 7, or a documented custom size |
| `--ai-repeats` | Repeats per prompt |
| `--max-queries` | Core-query ceiling |
| `--allow-over-budget` | Explicit opt-in to exceed a configured ceiling |
| `--no-cache` | Disable the local raw-response cache |

A plan that exceeds a ceiling does not run without `--allow-over-budget`. `--max-cost-usd` cannot be enforced without a reliable local price. The tool will not invent one. A cost ceiling supplied through `LV_MAX_RUN_COST_USD` follows the same rule: without `--pricing`, the live run stops before any paid request.

### 4. Keep the run local

Raw provider responses, AI prompts, geo-grid coordinates, competitor research, and the client report stay in `.audit/`, `.cache/`, or `reports/`. All are gitignored.

Do not publish a real client report. Publication requires explicit client approval and a sanitization pass.

## Troubleshooting

| Symptom | Meaning |
|---|---|
| `DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD must be set` | Live mode needs exported credentials; fixture mode needs none. |
| `INSUFFICIENT EVIDENCE` | A validity gate failed. Read the gate detail; do not lower a check. |
| `query universe hash does not match` | The universe changed after collection. Start a new run. |
| `the plan exceeds a configured safety ceiling` | Raise the ceiling explicitly or reduce the scope. |
| `a deterministic check must use confidence=verified` | The audit was hand-edited incorrectly. Deterministic checks are verified by definition. |
| `one-pager word count outside 550-1200` | Trim the prose or remove a non-essential section. |
| `an active hard cap is not disclosed` | The report must state the cap and its trigger. |

## What not to do

- Do not run a live audit against a business you do not have permission to analyze.
- Do not commit `.audit/`, `.cache/`, `reports/`, or a real configuration.
- Do not publish a real client's prompts, grid coordinates, or competitor set.
- Do not edit a score after collection to reach a desired band.
- Do not treat a provider outage as a low business score.

---

## Scorecard family boundary

This page covers discovery. The [GBP Scorecard](https://thatguynef.github.io/gbp-scorecard/) diagnoses profile trust and action; the [Website Scorecard](https://thatguynef.github.io/website-scorecard/) diagnoses website conversion. Read [The Scorecard Family](scorecard-family.md) for the ownership matrix and the no-duplicate-scoring rule.
