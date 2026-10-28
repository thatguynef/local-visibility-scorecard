# Changelog

## 1.0.0 — 2026-10-27

Initial public V1.

### Added

- Seven-category, 52-check Local Visibility rubric with A–F bands and a single deterministic cap.
- Locked query-universe builder with a content hash carried through every artifact.
- Configurable geo-grid (3×3, 5×5, 7×7, custom) with a recorded geometry hash.
- Google Local Pack, Maps, Local Finder, organic, AI Mode, ChatGPT/LLM Mentions, backlinks, and business-listings provider adapters.
- Provider-agnostic normalized audit model with per-source provenance.
- AI source-type separation: consumer/search surfaces and model/API responses are never pooled.
- AI repeat collection with a documented majority rule and repeat-stability metric.
- Locked business-competitor and SERP-occupier cohorts.
- Validity gates that return `INSUFFICIENT EVIDENCE` instead of a low score.
- Deterministic scorer with applicability-aware normalization, owner-data exclusion, and one hard cap.
- Renderer with the signature service × surface visibility matrix, geo-grid summary, AI surface breakdown, and provenance.
- Verifier with independent metric, deterministic-check, and validity-gate recomputation plus a mutation suite.
- Offline judgment eval harness.
- Synthetic Acme Plumbing fixture and public example scoring 60 / 100 (C, Average).
- Privacy scanner extended for DataForSEO credentials, Basic Authorization values, provider caches, geo-grid data, and real-client artifacts.
- Strict MkDocs documentation site with the shared scorecard-family visual tokens.
- Offline CI and GitHub Pages workflow.

### Fixed

- A top-level DataForSEO `20000` response with a failing task is now a typed provider error, so the observation is recorded as not collected instead of "rank not found."
- Observed SERP businesses resolve to the locked competitor cohort by place ID, CID, domain, phone, then name/alias. Unlocked local businesses are recorded as `obs-...` and never counted as scored peers.
- Google Maps collection disables `search_places` by default, matching DataForSEO's warning that the mode can return a different location than the requested coordinate.
- The cost plan prices the actual authority work: one backlinks summary, then one referring-domains request for the target plus each competitor. Local Pack and organic quantities are aggregated under their shared price key instead of overwriting each other.
- A cost ceiling configured through `LV_MAX_RUN_COST_USD` now stops the run before any paid request when no reliable local pricing file is available.
- A missing cost or task ceiling is preserved as `null`. `Number(null)` previously became `0`, which would have blocked the first live request with an immediate zero-dollar ceiling.
- ChatGPT LLM Mentions refuses a non-US location or non-English language instead of silently collecting US data for another market. The collector pins the provider's US-level location code and records that limitation; prompts still name the target market.
- AI Mode and Local Finder coordinates are clamped to their documented zoom ranges.
- The privacy scanner treats a real-looking street address as a hard finding; synthetic addresses must contain `Example`, `Synthetic`, or `placeholder`.
- A disabled emergency, near-me, or city-modified condition now removes that intent and its queries before the universe is hashed, instead of scoring it as N/A while it still influenced demand-weighted visibility.
- Demand provenance now records `configured_market_config` or `dataforseo_keyword_overview`; a live universe no longer keeps the synthetic-fixture label.
- The full report now lists the top cited AI source domains, counted from the recorded per-pair citation lists.
- A missing competitor cohort, an unsupported AI surface, and ChatGPT on a non-US market now fail during preflight, before Maps and organic requests are sent.
- A partial-name match is now reported as ambiguous instead of a confirmed target match. Identity resolution requires a place ID, CID, domain, phone, or exact name/alias.
- Regression coverage increased to 30 pipeline tests and 22 scorer tests, including provider task errors, null ceilings, cohort matching, cost math, Maps defaults, the LLM Mentions market guard, source provenance, target ambiguity, and the wrapper's synthetic-label behavior.

### Security

- No credentials are required for fixture mode or CI.
- The application never loads `.env` automatically.
- Raw provider responses, client reports, real configurations, and geo-grid coordinates stay local.
- `npm run check:privacy` and `node scripts/privacy_scan.mjs --history` pass on the initial tree.

### Known limitations

- Public Mode only. Connected Mode is a documented future mode.
- V1 AI surfaces: Google AI Mode and ChatGPT via LLM Mentions. Additional surfaces are future adapters.
- ChatGPT LLM Mentions is limited by the provider to the United States and English. The collector refuses another market rather than substituting US data.
- Google AI Overview is future work. AI Mode is the V1 Google AI surface.
- LLM Responses endpoints are not implemented until their current request shapes are validated.
- The synthetic example is not a real business, market, or competitor set.
