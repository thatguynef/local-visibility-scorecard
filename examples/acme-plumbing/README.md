# Acme Plumbing (synthetic)

This is the golden fixture for Local Visibility Scorecard V1. It is **not a real business**, not a real market, and not a real competitor set.

## Result

| Field | Value |
|---|---|
| Score | **60 / 100** |
| Band | **C (Average)** |
| Total | 59.9 |
| Rubric | 1.0.0 |
| Query universe | `sha256:f1e8f2e1817f87f64c6c07801b91315c0e51458eecf7496da8f060db92c93d6c` |
| Grid | 7 × 7 / 49 points |
| Maps observations | 784 |
| Organic observations | 32 (30 core + 2 branded diagnostic) |
| AI observations | 48 (16 prompts × 3 repeats) |
| N/A checks | `LV-MAP-10` (Local Finder not configured), `LV-RES-05` (no prior run) |
| Cap | None active |

The score is the rubric's output. It was not set in advance.

## Files

| File | Purpose |
|---|---|
| `audit.raw.json` | Pending collector worksheet with deterministic checks pre-filled and judgment checks pending |
| `audit.filled.json` | Reviewed audit with all 52 checks scored |
| `query-universe.json` | Locked query universe and hash |
| `judgment.json` | Five structured judgment decisions |
| `scores.json` | Deterministic score output |
| `scorecard.md` | Score-only Markdown summary |
| `content.json` | Reviewer-written report prose |
| `one-page.md` | Contractor-facing one-pager |
| `full-report.md` | Full evidence report |
| `verification.json` | Verifier record with mutation suite |
| `metrics.json` | The deterministic metric block |

## Reproduce

```sh
npm run collect -- \
  --fixture .opencode/skills/home-service-local-visibility-audit/scripts/fixtures/acme-plumbing.raw.json \
  --out .audit/acme-plumbing/demo \
  --run-id 2026-01-01T0000-acme

node .opencode/skills/home-service-local-visibility-audit/scripts/apply_judgment.mjs \
  --audit .audit/acme-plumbing/demo/audit.json \
  --judgment .opencode/skills/home-service-local-visibility-audit/scripts/fixtures/acme-plumbing.judgment.json \
  --out .audit/acme-plumbing/demo/audit.filled.json

python3 .opencode/skills/home-service-local-visibility-audit/scripts/score.py \
  --input .audit/acme-plumbing/demo/audit.filled.json \
  --out .audit/acme-plumbing/demo/scores.json \
  --markdown .audit/acme-plumbing/demo/scorecard.md \
  --strict

npm run verify:example
```

## What the synthetic scenario exercises

- Strong general plumbing and drain cleaning near the center.
- Weak emergency visibility.
- A thin Local Pack across the market.
- Absent sewer and repiping visibility.
- Moderate authority with a competitor gap.
- AI mentions sometimes, recommendations less often, citations rarely.
- Two AI source types (consumer/search and model/API), recorded separately.
- Three AI repeats per prompt, with some instability.
- A locked competitor cohort and a locked query universe.
- Deterministic checks, judgment checks, N/A checks, owner-data questions, and opportunity flags.
- Provenance, a query-universe hash, a grid hash, and a verification record.

## Synthetic labels

Every report footer and title states that the example is synthetic. The verifier fails if the label is removed.

## Do not copy this configuration to a real business

The market, coordinates, business, competitors, and demand values are synthetic. Use `config/market.example.json` as a shape reference, not as a real market configuration.
