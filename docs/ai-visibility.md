---
description: "How the Local Visibility Scorecard measures AI mention, recommendation, and citation behavior across validated consumer and model surfaces."
---

# AI visibility methodology

AI answers are a real local-discovery surface. They are also the easiest surface to measure badly.

This page explains what the scorecard records, what it refuses to pool, and why a single mention is not a score.

## Surfaces

V1 supports:

| Platform | Surface | `source_type` | Method |
|---|---|---|---|
| Google | AI Mode | `consumer_surface` | SERP AI Mode observation |
| Google | AI Overview (future) | `consumer_surface` | Not implemented in V1; validate the request shape first |
| ChatGPT | ChatGPT via LLM Mentions | `model_api` | LLM mention observation (US/English only per provider) |
| Gemini, Perplexity, Claude | Future validated adapters | `model_api` | Not in V1 |

A consumer/search surface observation is not the same as a model/API response. They are recorded separately and never pooled into one opaque metric.

The ChatGPT adapter refuses a market or language the provider does not support. A US-only observation is never silently reused for a business in another country; the audit records the limitation or returns `INSUFFICIENT EVIDENCE` if the required surface cannot be collected.

Only validated surfaces contribute to the core score. Experimental sources can be reported as diagnostics without score impact.

## What is recorded

Every AI observation records:

```json
{
  "platform": "google",
  "product_surface": "Google AI Mode",
  "source_type": "consumer_surface",
  "method": "serp_ai_mode",
  "provider": "dataforseo",
  "prompt": "Who can help with an emergency plumbing problem in Example County today?",
  "market": "Example County, CA",
  "language": "en",
  "repeat": 2,
  "model_version": "available-model-version",
  "target_mentioned": true,
  "target_recommended": false,
  "target_cited": false,
  "target_entity_accuracy": "accurate",
  "cited_domains": ["yelp.com", "example-county-news.example"],
  "competitor_mentions": []
}
```

The three target fields are separate:

- **Mentioned** — the business appears in the answer.
- **Recommended** — the answer recommends it, not merely lists it.
- **Cited** — the answer cites its domain or entity as a source.

A mention inside a directory list is not a recommendation. A recommendation without a citation is not a citation. Do not reduce AI visibility to `"AI visibility": "yes"`.

## Repeats

AI answers vary. The framework does not pretend otherwise.

Each prompt-platform pair is observed `R` times. The default is three repeats, determined by fixture work and documented in configuration. Every repeat is recorded separately.

Aggregation rule:

- pair mention/recommendation/citation is true when it appears in at least `ceil(R/2)` repeats;
- repeat stability is the share of pairs where all repeats agree on mention status;
- unstable prompts are reported separately.

A live audit should increase repeats before drawing a firm conclusion. A single run is a snapshot, not a trend.

## Metrics

| Metric | Definition |
|---|---|
| Mention coverage | Share of validated prompt-platform pairs where the target is mentioned |
| Recommendation coverage | Share where it is recommended |
| Citation coverage | Share where its domain or entity is cited |
| Prompt-intent coverage | Share of canonical prompt intents with at least one mention or recommendation |
| Repeat stability | Share of pairs where every repeat agrees on mention |
| Surface breadth | Share of validated surfaces with at least one mention |
| Competitive share | Target recommendations ÷ target + business-competitor recommendations |

Directories and publishers are excluded from the competitor denominator. They are recorded as SERP occupiers and citation sources, not as contractors.

Top cited source domains are counted from the per-pair citation lists and shown in the full report. They are diagnostic context, not a separate score.

## Where prompts come from

AI prompts derive from the same intent model as the search queries. They are not a separate GEO list.

```text
INTENT: water heater repair
Search queries:
  water heater repair
  water heater repair Example County
  water heater not working
AI prompts:
  Who repairs tankless water heaters in Example County?
  Which local company should I call when my water heater stops working?
```

The prompt templates are versioned, deterministic where possible, reviewed, tied to intent IDs, and locked before results collection.

## Judgment

Most AI checks aggregate structured booleans. Three checks require review:

- `LV-AI-04` — service relevance;
- `LV-AI-05` — location relevance;
- `LV-AI-06` — entity accuracy.

The judgment layer accepts a score, evidence, and source references. It cannot invent a source ID or rewrite a deterministic fact. See [Judgment layer](judgment.md).

## What the score does not claim

- It does not guarantee that an AI recommendation produces a visit, a lead, or a job.
- It does not treat one AI answer as a durable ranking.
- It does not pool ChatGPT, Gemini, Perplexity, Claude, and Google AI Mode into a single "AI score."
- It does not claim that a citation is an endorsement.
- It does not use a model's free-form prose as the score.

AI referral traffic and AI-origin leads are owner-data questions. They are reported separately and never reduce the public score.

## Reproducibility

The audit records the prompt, platform, surface, method, provider, market, language, repeat, and model version where available. The verifier checks that the observation's `source_type` matches its surface and that consumer/search and model/API observations are not pooled.

A historical AI score can be reproduced from the audit artifact and the rubric. The external system may produce different answers tomorrow; that is acceptable when provenance is preserved.

---

## Scorecard family boundary

This page covers discovery. The [GBP Scorecard](https://thatguynef.github.io/gbp-scorecard/) diagnoses profile trust and action; the [Website Scorecard](https://thatguynef.github.io/website-scorecard/) diagnoses website conversion. Read [The Scorecard Family](scorecard-family.md) for the ownership matrix and the no-duplicate-scoring rule.
