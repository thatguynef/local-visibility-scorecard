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

### Security

- No credentials are required for fixture mode or CI.
- The application never loads `.env` automatically.
- Raw provider responses, client reports, real configurations, and geo-grid coordinates stay local.
- `npm run check:privacy` and `node scripts/privacy_scan.mjs --history` pass on the initial tree.

### Known limitations

- Public Mode only. Connected Mode is a documented future mode.
- V1 AI surfaces: Google AI Mode and ChatGPT via LLM Mentions. Additional surfaces are future adapters.
- LLM Responses endpoints are not implemented until their current request shapes are validated.
- The synthetic example is not a real business, market, or competitor set.
