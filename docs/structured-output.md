# Structured output

Every artifact is versioned and carries enough provenance to answer: where did this come from, when was it collected, was it observed or provider-derived, and which audit mode produced it?

## Files

| File | Schema | Purpose |
|---|---|---|
| `audit.json` | `raw-audit-v1.schema.json` | Pending collector worksheet |
| `audit.filled.json` | `audit-v1.schema.json` | Scored audit input with facts and checks |
| `query-universe.json` | `query-universe-v1.schema.json` | Locked query universe |
| `judgment.json` | `judgment-v1.schema.json` | Structured model/reviewer proposal |
| `scores.json` | `scores-v1.schema.json` | Deterministic score output |
| `verification.json` | `verification-v1.schema.json` | Verifier record |

Schemas live in `.opencode/skills/home-service-local-visibility-audit/references/schema/`.

Run:

```sh
npm run check:schemas
```

## `audit.filled.json`

```json
{
  "schema_version": "1.0",
  "audit_mode": "public",
  "run": {},
  "business": {},
  "market": {},
  "configuration": {},
  "query_universe": {},
  "sources": [],
  "validity": {},
  "maps": {},
  "organic": {},
  "ai": {},
  "competitors": {},
  "authority": {},
  "resilience": {},
  "metrics": {},
  "facts": {},
  "checks": {},
  "limitations": []
}
```

Key blocks:

- **`run`**: run ID, timestamps, collector version, rubric version, source mode (`fixture` or `live`), synthetic flag, query-universe hash.
- **`business`**: name, trade, market, domain, place ID, phone, aliases, resolution.
- **`market`**: name, region, country, language, device, center, radius, grid ID, universe ID.
- **`configuration`**: applicability booleans and safety settings.
- **`query_universe`**: the locked universe, including its hash.
- **`sources`**: source ID, provider, type, method, endpoint family, surface, collected time, collector version, location method, language, device, field completeness.
- **`validity`**: provider error rate, critical outage flag, planned/collected counts, gate results.
- **`maps`**: grid geometry, surfaces, observations.
- **`organic`**: organic observations.
- **`ai`**: AI surfaces and observations.
- **`competitors`**: locked business cohort, SERP occupiers, AI cohort.
- **`authority`**: referring domains, listings, competitor counts, AI citation domains.
- **`resilience`**: historical runs and notes.
- **`metrics`**: deterministic metrics and visibility matrix.
- **`facts`**: the nine structured cap/validity facts. They must restate observations.
- **`checks`**: all 52 canonical checks.
- **`limitations`**: public-mode limitations.

No credentials, authorization headers, cookies, customer names, customer emails, customer phone numbers, or private review text.

## `scores.json`

| Field | Meaning |
|---|---|
| `categories` | Earned, applicable max, weight, normalized, N/A checks |
| `checks` | Every check with score, confidence, evidence, and references |
| `findings` | Checks with lost points |
| `verifiedFindings` | Findings backed by direct observation |
| `strongSignals` | Findings whose business consequence is not proven |
| `recommendations` | Deterministic fixes sorted by priority and lost points |
| `ownerDataRequired` | Owner questions with `publicScoreImpact: none` |
| `journey` | Stage statuses and earned/applicable points |
| `coverage` | One row per check, including N/A reasons |
| `opportunities` | Unscored opportunity flags |
| `metrics` | The full deterministic metric block |
| `visibilityMatrix` | The signature service × surface matrix |
| `validity` | Recomputed gate results |
| `normalization` | Applicable weight, raw total, N/A checks, universe hash |
| `caps` | Active and binding caps with deterministic triggers |
| `total`, `final`, `display`, `band` | Score, cap-adjusted score, display score, band |
| `sources` | Provenance for downstream tools |
| `meta` | Run, client, trade, market, audit mode, versions, universe hash |
| `status` | `scored` |

Owner-data IDs never appear in `checks`. `ownerDataRequired` entries have `"publicScoreImpact": "none"`.

## `query-universe.json`

The universe includes:

- schema and universe versions,
- trade, market, language, device,
- services, intents, queries, prompts,
- demand model and quality gates,
- review status,
- hash.

The hash excludes volatile review metadata. It is carried into every downstream artifact.

## `verification.json`

```json
{
  "schema_version": "1.0",
  "run_id": "2026-01-01T0000-acme",
  "verifier": "verify.mjs",
  "date": "2026-01-01",
  "rubric_version": "1.0.0",
  "audit_mode": "public",
  "result": "pass",
  "query_universe_hash": "sha256:...",
  "checks": {},
  "hard_failures": [],
  "soft_failures": [],
  "mutation_tests": "pass",
  "mutations": [],
  "fixture": {},
  "score": 60,
  "word_count": 1142,
  "waivers": []
}
```

## Versioning

- `schema_version` is the artifact contract.
- `rubric_version` is the canonical methodology.
- `universe_version` is the query-universe methodology.
- `scorer_version`, `collector_version`, and `verifier` identify the executable stage.

An unknown `schema_version` fails safely. A rubric version mismatch fails. A historical score can be reproduced with the matching rubric and audit.

## Downstream use

RAD or another system may consume:

- `scores.json` for findings, confidence, category math, owner-data questions, and fix mappings;
- `verification.json` for release status;
- `coverage-matrix.json` for the check inventory;
- `query-universe.json` for the locked demand model.

The machine-readable fix mapping lives in `rubric.json` under `fixes` and includes `checkId`, `priority`, `fix`, and `radModules`. A downstream system must not treat a recommended service as a diagnosis.

## Determinism

The collector may change over time because the external systems change. The scorer does not. Given the same `audit.filled.json` and rubric, the score is identical.

The verifier recomputes the metrics, deterministic check scores, and validity gates from the normalized observations. A hand-edited score or metric fails verification.
