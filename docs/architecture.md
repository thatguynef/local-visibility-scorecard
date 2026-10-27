# Architecture

Local Visibility Scorecard keeps collection, judgment, scoring, rendering, and verification separate. Each stage is independently runnable.

```text
COLLECT
search / maps / AI / authority observations
        ↓
REVIEW
human or model fills only what needs judgment
        ↓
SCORE
validate · normalize · apply caps
        ↓
RENDER
one-page + full report
        ↓
VERIFY
invariants · provenance · mutations
```

## Stage 1 — Collect

`collect.mjs` writes a **pending worksheet** to `.audit/<slug>/<run-id>/`:

- `audit.json` — normalized observations, sources, metrics, and 52 checks (deterministic checks pre-filled, judgment checks pending),
- `query-universe.json` — the locked universe,
- `run.json` — manifest with audit mode, source mode, versions, and universe hash,
- `metrics.json` — the deterministic metric block,
- `plan.json` — task counts and ceilings, in live mode.

Fixture mode reads a synthetic normalized fixture. It performs no network access and needs no credentials.

Live mode uses DataForSEO through the provider layer. It never calls, texts, books, submits a form, or changes a profile.

## Stage 2 — Review

A reviewer fills the five judgment checks in `audit.filled.json`:

- `LV-ORG-05` — ranking URL relevance,
- `LV-AI-04` — service relevance in AI answers,
- `LV-AI-05` — location relevance,
- `LV-AI-06` — entity accuracy,
- `LV-AUT-02` — local source relevance.

Only those checks use judgment. Ranks, coverage, competitor share, authority counts, and validity gates are deterministic.

A model proposal is merged with `apply_judgment.mjs`, which accepts only model-judgment checks and requires evidence references. The reviewer must not invent unavailable data.

## Stage 3 — Score

`score.py` validates the filled audit, recomputes the query-universe hash, checks the validity gates, removes N/A checks, normalizes category weights to 100, applies the single deterministic cap, and writes `scores.json`.

The scorer never contacts the business. It is file-based and deterministic.

## Stage 4 — Render

`render.mjs` combines `scores.json` with reviewer-written `content.json`. The renderer owns:

- score strings,
- category and journey tables,
- the signature visibility matrix,
- the visibility snapshot,
- the geo-grid summary,
- the AI surface breakdown,
- check rows,
- fix point limits,
- confidence labels,
- synthetic label,
- provenance table.

The model owns prose: verdict, gaps, strengths, next steps, limitations. It cannot invent check IDs, owner-data IDs, or points.

## Stage 5 — Verify

`verify.mjs` independently recomputes the math and checks:

- check IDs and category weights,
- query-universe hash and lock,
- applicability and structural N/A,
- score bounds, evidence, confidence, source references,
- fact consistency and cap triggers,
- category and total math,
- owner-data exclusion,
- metrics and deterministic check derivation,
- validity gates,
- AI source-type separation,
- competitor cohort linkage,
- target-match confidence,
- report score, category rows, and finding rows,
- the visibility matrix,
- synthetic labels and required sections,
- no placeholders or credential-like material.

It runs a mutation suite that intentionally breaks totals, category scores, confidence, evidence, caps, labels, report linkage, owner-data exclusion, the universe hash, deterministic scores, metrics, validity gates, AI source types, the competitor cohort, target matches, and N/A handling. If a mutation survives, verification fails.

## Why the stages stay separate

A monolith is hard to audit. Separating files makes it possible to:

- inspect observations without re-running collection;
- change a report without changing a score;
- reproduce a historical score;
- test a cap in isolation;
- replace the judgment layer with fixtures;
- run CI with no credentials and no network.

`npm run audit` is a wrapper that prints the next commands. It is not an opaque scoring engine.

## Audit modes

Public Mode is the only implemented mode. Connected Mode is a future, authorized read-only mode. Each run records `audit_mode`. The public score is never silently rewritten with connected performance data; connected diagnostics will be reported separately.

## Non-destructive boundary

The collector:

- uses search and data-provider requests only;
- does not submit forms;
- does not create bookings;
- does not place calls or send messages;
- does not create accounts;
- does not enter payments;
- does not mutate a profile;
- uses explicit timeouts, bounded retries, and bounded response reads.

## Repository layout

```text
.opencode/skills/home-service-local-visibility-audit/
  SKILL.md
  references/
    rubric.json
    rubric.md
    coverage-matrix.json
    portable-checklist.md
    fix-library.md
    one-page-template.md
    report-template.md
    schema/
  scripts/
    build_universe.mjs
    collect.mjs
    score.py
    render.mjs
    verify.mjs
    apply_judgment.mjs
    eval.mjs
    providers/dataforseo/
    lib/
    fixtures/
examples/acme-plumbing/
docs/
scripts/
```

See [Development](development.md) for commands and test structure.
