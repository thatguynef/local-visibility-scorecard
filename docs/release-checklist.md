# Release Checklist

Use this before publishing a release, enabling GitHub Pages, or merging a change that alters the rubric, schemas, or output.

## Security

- [ ] `npm run check:privacy` passes.
- [ ] `node scripts/privacy_scan.mjs --history` passes.
- [ ] No `.env` file is tracked.
- [ ] No DataForSEO login, password, Basic Authorization value, API key, OAuth secret, token, cookie, session file, or private key is tracked.
- [ ] No real customer or client PII is tracked.
- [ ] No real-client report, screenshot, raw API response, geo-grid coordinate, prompt log, or private fixture is tracked.
- [ ] Every public example is labeled **synthetic** or **sanitized**.
- [ ] `git status`, `git diff`, `git diff --cached`, and `git ls-files` were inspected by a human.
- [ ] The CI privacy job has run on the final commit.

## Methodology

- [ ] `references/rubric.json` is the canonical source.
- [ ] Category weights total 100.
- [ ] Seven categories match the family weights: A 15, B 25, C 15, D 20, E 10, F 10, G 5.
- [ ] Every check ID is unique and mapped to a journey stage.
- [ ] Every check has anchors, evidence types, and an applicability rule.
- [ ] The query universe is locked before collection and the hash is carried into every artifact.
- [ ] Core queries are non-branded.
- [ ] Branded queries are diagnostic and do not inflate the core score.
- [ ] Local Pack, Maps, and Local Finder are not silently merged.
- [ ] AI consumer/search surfaces and model/API surfaces are not pooled.
- [ ] The competitor cohort is locked and separates business competitors from SERP occupiers.
- [ ] Target identity resolution is validated.
- [ ] Demand weighting is documented and bounded.
- [ ] Owner-data questions are separate and do not contribute to the score.
- [ ] Opportunity flags are separate from universal penalties.
- [ ] The one hard cap has a deterministic trigger, rationale, test, and fixture coverage.
- [ ] N/A normalization has a test.
- [ ] A provider outage fails a validity gate rather than becoming a low score.
- [ ] Generated artifacts are current (`npm run check:generated`).
- [ ] `score.py --strict` passes on the golden fixture.

## Pipeline

- [ ] Collector runs in fixture mode with no external network or credentials.
- [ ] Live mode fails clearly when credentials are absent.
- [ ] `--dry-run` and `--plan` send no paid request.
- [ ] Task ceilings and the optional cost ceiling are enforced.
- [ ] Scorer is deterministic.
- [ ] Renderer is deterministic.
- [ ] Verifier is independent and recomputes metrics, deterministic checks, and validity gates.
- [ ] Mutation tests fail when an invariant is broken.
- [ ] The synthetic example passes `npm run verify:example`.
- [ ] The one-pager is between 550 and 1,200 words.
- [ ] The full report is longer than the one-pager.

## Documentation

- [ ] `npm run docs:build` passes with `--strict` and zero warnings.
- [ ] Relative links pass.
- [ ] Images exist, have alt text, and respect budgets.
- [ ] README explains audience, purpose, framework, privacy, and the run process.
- [ ] `docs/privacy.md` matches actual repository behavior.
- [ ] `docs/scorecard-family.md` states the boundaries with GBP and Website Scorecards.
- [ ] `docs/query-universe.md`, `docs/geo-grid.md`, and `docs/ai-visibility.md` explain the methodology.
- [ ] The home page can be published without private data.
- [ ] The site looks like a sibling to the other two scorecards.

## GitHub

- [ ] Repository description and topics are set.
- [ ] Branch protection requires CI.
- [ ] Secret scanning and push protection are enabled.
- [ ] Dependabot alerts are enabled.
- [ ] GitHub Pages uses the Docs workflow.
- [ ] The published URL works with no authentication.
- [ ] Private vulnerability reporting is enabled.

## Manual live validation (after the gates above)

- [ ] Use a business where publication is not assumed.
- [ ] Keep all live output under `.audit/` or `reports/`.
- [ ] Do not publish the run.
- [ ] Check target matching, grid design, query-universe quality, demand weighting, competitor selection, AI volatility, citation classification, false positives, score intuitiveness, and report usefulness.
- [ ] Any rubric change is re-tested against the golden fixture and mutation suite.

## Calibration

- [ ] Rank bands are calibrated with synthetic and live validation.
- [ ] Demand weighting is checked for head-term domination.
- [ ] Geo-grid aggregation is checked against quadrant distributions.
- [ ] AI repeat policy is checked for volatility.
- [ ] AI recommendation and citation rules are checked against human classification.
- [ ] Competitor-share thresholds are checked against real local cohorts.
- [ ] Authority comparison is checked against relevance, not raw quantity.
- [ ] Category weights are checked for sensitivity.
- [ ] The hard cap is checked against a genuine zero-discovery case.
- [ ] The rubric is not tuned to give one business a desired score.
- [ ] Regression fixtures are maintained.
- [ ] Rubric changes are versioned semantically.
