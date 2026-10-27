# Data sources

DataForSEO is the **implementation provider** for Public Mode. It is not the methodology. The normalized data model, rubric, and score are provider-agnostic. A future adapter can replace the provider without rewriting the scorecard.

## Endpoint families used

Endpoint shapes were verified against the current official DataForSEO documentation on **2026-10-27**. Do not rely on an old request or response shape.

| Family | Endpoint | Used for |
|---|---|---|
| SERP | `POST /v3/serp/google/organic/live/advanced` | Local Pack observations and organic results |
| SERP | `POST /v3/serp/google/maps/live/advanced` | Google Maps observations at a coordinate |
| SERP | `POST /v3/serp/google/local_finder/live/advanced` | Local Finder observations where configured |
| SERP | `POST /v3/serp/google/ai_mode/live/advanced` | Google AI Mode consumer/search observations |
| DataForSEO Labs | `POST /v3/dataforseo_labs/google/keyword_overview/live` | Demand context for the locked universe |
| AI Optimization | `POST /v3/ai_optimization/llm_mentions/search_mentions/live` | ChatGPT/model mention observations |
| Backlinks | `POST /v3/backlinks/summary/live` | Authority summary |
| Backlinks | `POST /v3/backlinks/referring_domains/live` | Referring-domain relevance and competitor comparison |
| Business Data | `POST /v3/business_data/business_listings/search/live` | Target resolution and external listing consistency |

Official references:

- [Google Maps SERP](https://docs.dataforseo.com/v3/serp/google/maps/live/advanced/)
- [Google Local Finder SERP](https://docs.dataforseo.com/v3/serp/google/local_finder/live/advanced/)
- [Google AI Mode SERP](https://docs.dataforseo.com/v3/serp/google/ai_mode/live/advanced/)
- [Google Organic SERP](https://docs.dataforseo.com/v3/serp/google/organic/live/advanced/)
- [DataForSEO Labs Keyword Overview](https://docs.dataforseo.com/v3/dataforseo_labs/google/keyword_overview/live/)
- [LLM Mentions](https://docs.dataforseo.com/v3/ai_optimization/llm_mentions/search_mentions/live/)
- [Backlinks Summary](https://docs.dataforseo.com/v3/backlinks/summary/live/)
- [Referring Domains](https://docs.dataforseo.com/v3/backlinks/referring_domains/live/)
- [Business Listings Search](https://docs.dataforseo.com/v3/business_data/business_listings/search/live/)

## Provider layer

All vendor-specific HTTP lives in:

```text
providers/dataforseo/
  auth.mjs          environment-only Basic Auth
  client.mjs        timeout, retries, concurrency, cache, cost tracking
  serp.mjs          organic, maps, local finder, AI Mode
  labs.mjs          demand context
  ai.mjs            LLM mentions
  backlinks.mjs     summary and referring domains
  business-data.mjs business listings
  normalize.mjs     raw response → normalized observation
```

The rest of the pipeline consumes normalized structures, not raw DataForSEO responses.

## Authentication

Credentials come from the environment only:

```sh
export DATAFORSEO_LOGIN="..."
export DATAFORSEO_PASSWORD="..."
```

The application never loads `.env` automatically. It never writes the login, password, or Basic Authorization header to an audit artifact, cache key, URL, log, report, or exception.

## Request safety

The client enforces:

- an explicit timeout,
- bounded retries with backoff,
- bounded concurrency,
- a maximum response size,
- request deduplication,
- a local raw-response cache,
- rate-limit and provider-error classification,
- partial-run detection,
- task and cost tracking.

It never logs request headers or dumps an auth object.

## Cost

Before a live run, the collector shows:

- core keywords,
- grid points,
- Maps and Local Pack tasks,
- organic tasks,
- AI prompt tasks,
- competitor and authority tasks,
- estimated total task count,
- configured SERP and AI task ceilings,
- cost estimate, if a local pricing file is supplied.

If a reliable cost estimate is unavailable, the tool says so. It does not invent a provider price. `--max-cost-usd` requires `--pricing` with real local prices.

`--dry-run` and `--plan` send no paid request. A plan that exceeds a configured ceiling does not run without explicit `--allow-over-budget` opt-in.

## Raw responses

Raw provider responses stay in `.cache/dataforseo/` or `.audit/`. Both are gitignored. The audit artifact contains normalized observations and provenance, not the raw payload.

Never commit raw API responses from a real audit.

## Provider-agnostic model

A source record says `provider: "dataforseo"` because that is how the observation was collected. The score does not require DataForSEO. The normalized model is:

- surface,
- method,
- location method,
- language,
- device,
- observation,
- target match,
- competitors,
- provenance.

A future provider can implement the same normalized shape.

## Current limitations

- V1 implements Google surfaces, Google AI Mode, ChatGPT via LLM Mentions, backlinks, and business listings.
- Bing, Apple Maps, Nextdoor, Yelp, Houzz, and manufacturer directories are documented future adapters.
- LLM Responses endpoints are not implemented until their current request shapes are validated against the official documentation and a fixture. Do not guess an endpoint.
- DataForSEO availability, pricing, and response shapes can change. Re-verify the official documentation before changing an adapter.

## What the report says

The report identifies DataForSEO as the provider and includes a provenance table. It does not present the provider as the methodology, and it does not publish account spending.
