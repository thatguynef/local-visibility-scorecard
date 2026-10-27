# Contributing

Thanks for helping improve Local Visibility Scorecard. This is a public repository that diagnoses real businesses, so security and evidence quality come before feature count.

## Before you start

- Read [Architecture](docs/architecture.md), [Evidence](docs/evidence.md), and [Scoring](docs/scoring.md).
- Run `npm run doctor` and `npm test`.
- Never include a real client's data in an issue, pull request, fixture, or example.
- Never include a DataForSEO credential, Basic Authorization value, or raw API response from a real audit.

## Development setup

```sh
git clone https://github.com/thatguynef/local-visibility-scorecard.git
cd local-visibility-scorecard
npm run doctor
npm test
npm run verify:example
```

No runtime npm dependencies are required. Node 22+ and Python 3.10+.

## What to change where

| Change | File |
|---|---|
| A check, weight, anchor, or fix mapping | `.opencode/skills/home-service-local-visibility-audit/references/rubric.json` |
| A deterministic metric | `.opencode/skills/home-service-local-visibility-audit/scripts/lib/metrics.mjs` |
| A provider endpoint | `providers/dataforseo/` |
| A normalized field | `providers/dataforseo/normalize.mjs` and the matching schema |
| A report table | `render.mjs` and the templates |
| A verifier invariant | `verify.mjs` |
| A doc page | `docs/` |

Do not hand-edit generated files:

- `references/rubric.md`
- `docs/rubric.md`
- `references/coverage-matrix.json`
- `references/portable-checklist.md`
- `docs/portable-checklist.md`
- `references/fix-library.md`
- `docs/fix-library.md`
- `docs/assets/*`

Regenerate with the scripts listed in [Development](docs/development.md).

## Rubric changes

A rubric change is a methodology change. It needs:

1. A documented reason and the user problem it solves.
2. Exact anchors with thresholds.
3. A synthetic fixture that exercises the new check at full, partial, and zero.
4. Updated deterministic metrics and verifier derivation.
5. Updated generated artifacts.
6. A semantic version bump.
7. A regression run on the golden fixture.
8. A note in `CHANGELOG.md`.

Do not tune the rubric to give one business a desired score.

## Tests

```sh
npm test
npm run check:rubric
npm run check:generated
npm run check:schemas
npm run check:links
npm run check:assets
npm run check:privacy
npm run verify:example
```

The verifier mutation suite must pass. If a mutation survives, the invariant is incomplete.

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

If you find a credential:

1. Stop.
2. Rotate it vendor-side.
3. Remove it from the current tree.
4. Do not rewrite history without explicit owner authorization.
5. Re-run the history scan after any authorized rewrite.

## Pull requests

- Keep the change focused.
- Explain the evidence and the user impact.
- Include the commands you ran and the result.
- Update the docs and schemas in the same change.
- Do not include a real client report or screenshot.
- Do not claim a revenue lift.

## Code style

- ES modules, no semicolon-free style, two-space indentation.
- Python standard library only.
- Prefer explicit data over clever abstractions.
- No network access in tests or CI.
- No new dependency without a clear security, correctness, or maintainability reason.

## Commit messages

Use an imperative summary, for example:

```text
Add geo-grid quadrant gap metric
Harden query-universe hash validation
Fix owner-data label in the one-pager
```

## License

By contributing, you agree that your contribution is licensed under the MIT License.
