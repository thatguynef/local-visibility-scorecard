# Development

## Requirements

- Node.js 22+
- Python 3.10+
- git

No runtime npm dependencies. Node and Python standard libraries are used directly.

## Commands

```sh
npm run doctor          # toolchain check
npm test                # Python unit tests + Node pipeline tests
npm run check:rubric    # canonical rubric validation
npm run check:generated # generated artifacts are current
npm run check:schemas   # JSON Schemas + example artifacts
npm run check:links     # relative Markdown links
npm run check:assets    # images, alt text, budgets
npm run check:privacy   # secret/PII/path scan
npm run verify:example  # score + render + verify the synthetic example
npm run docs:build      # MkDocs strict build
```

`npm run check` runs the offline checks in sequence.

## Pipeline

```sh
# 1. Build and lock the query universe
npm run universe -- --config config/market.example.json --out /tmp/universe.json

# 2. Collect (fixture or live)
npm run collect -- --fixture .opencode/skills/home-service-local-visibility-audit/scripts/fixtures/acme-plumbing.raw.json --out .audit/demo

# 3. Merge judgment checks
npm run judge -- --audit .audit/demo/audit.json --judgment .audit/demo/judgment.json --out .audit/demo/audit.filled.json

# 4. Score
npm run score -- --input .audit/demo/audit.filled.json --out .audit/demo/scores.json --strict

# 5. Render
npm run render -- --scores .audit/demo/scores.json --content .audit/demo/content.json --out .audit/demo/one-page.md
npm run render -- --mode full --scores .audit/demo/scores.json --content .audit/demo/content.json --out .audit/demo/full-report.md

# 6. Verify
npm run verify -- --run .audit/demo --mutation --synthetic
```

Each stage is independently runnable.

## Generated artifacts

`references/rubric.json` is the canonical source. Do not hand-edit:

- `references/rubric.md`
- `docs/rubric.md`
- `references/coverage-matrix.json`
- `references/portable-checklist.md`
- `docs/portable-checklist.md`
- `references/fix-library.md`
- `docs/fix-library.md`
- `docs/assets/*`

Regenerate:

```sh
python3 .opencode/skills/home-service-local-visibility-audit/scripts/render_rubric.py
python3 .opencode/skills/home-service-local-visibility-audit/scripts/render_coverage.py
python3 .opencode/skills/home-service-local-visibility-audit/scripts/render_portable.py
python3 .opencode/skills/home-service-local-visibility-audit/scripts/render_fix_library.py
npm run render:assets
```

`npm run check:generated` fails if any generated file is stale.

## Adding a check

1. Add the check to `rubric.json` (`items`, `fixes`, journey mapping).
2. Keep category maxima summing to their configured weights.
3. Document the anchors with exact thresholds.
4. Add the evidence types and evaluation method.
5. Add or update the metric in `lib/metrics.mjs` if the check is deterministic.
6. Add the check to the verifier's deterministic derivation and tests.
7. Regenerate the artifacts.
8. Add a synthetic case that exercises a full, partial, and zero score.
9. Run `npm run check` and `npm run verify:example`.

## Schemas

Schemas live in `references/schema/`. The schema checker is a deliberately small draft-2020-12 subset. It catches stale artifacts without adding a dependency.

If you add a field to an artifact, update the schema and the example in the same change. `npm run check:schemas` must pass.

## Determinism

- `score.py` performs no network access and no model call.
- `render.mjs` never invents a check ID, score, or point.
- `verify.mjs` recomputes metrics and deterministic checks from the normalized observations.
- The query-universe hash is recomputed in both Python and JavaScript.

If a change makes the same audit produce a different score, the change is not ready.

## Privacy

Before every commit:

```sh
npm run check:privacy
node scripts/privacy_scan.mjs --history
git status
git diff
git diff --cached
git ls-files
```

Do not force-add `.audit/`, `.cache/`, `reports/`, `evals/`, or a real configuration.

## Documentation

```sh
npm run docs:build
npm run docs:serve
```

The site uses MkDocs Material with the family design tokens. Keep the navigation and voice consistent with the sibling scorecards.

## CI

CI runs offline. It must not:

- access DataForSEO;
- access live LLMs;
- use real credentials;
- run paid tasks;
- search real businesses;
- query real competitor sets;
- contact clients;
- mutate external services.

See `.github/workflows/ci.yml`.
