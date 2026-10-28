# Query universe

The query universe is the set of search intents and AI prompts used to measure visibility. It is defined, reviewed, and locked **before** any ranking is collected.

This is the most important methodological control in the scorecard. Choosing keywords after seeing the results is the easiest way to manufacture a flattering score.

## The lock sequence

```text
DEFINE MARKET
      ↓
DEFINE SERVICES
      ↓
GENERATE CANDIDATE INTENTS
      ↓
GET DEMAND DATA
      ↓
CLASSIFY / DEDUPE
      ↓
LOCK QUERY UNIVERSE
      ↓
COLLECT VISIBILITY
```

The collector refuses to run live visibility collection against an unlocked universe. The scorer recomputes the universe hash and refuses a mismatch.

## What the universe records

```json
{
  "schema_version": "1.0",
  "universe_id": "acme-plumbing-synthetic-example-county-v1",
  "universe_version": "1.0.0",
  "trade": "plumbing",
  "market": {},
  "language": "en",
  "device": "mobile",
  "created_at": "2026-01-01T00:00:00Z",
  "locked_at": "2026-01-01T00:00:00Z",
  "locked": true,
  "generation_method": "deterministic_service_intent_templates_v1",
  "review": { "status": "approved", "reviewed_at": "...", "reviewer": "..." },
  "hash": "sha256:...",
  "services": [],
  "intents": [],
  "queries": [],
  "prompts": [],
  "demand_model": {},
  "quality_gates": {}
}
```

### Services

Each service has an ID, label, priority, symptoms, and demand data. The service list defines the clusters used for coverage and competitive analysis.

### Intents

Each intent has:

- an ID,
- a service ID,
- an intent class,
- a label,
- demand data,
- a bounded weight,
- a `core` flag,
- a `brand` flag.

Intent classes:

| Class | Example |
|---|---|
| `category` | plumber |
| `service` | water heater repair |
| `emergency` | emergency plumber |
| `near_me` | drain cleaning near me |
| `city_modified` | drain cleaning Example County |
| `problem_symptom` | clogged drain repair |
| `high_ticket` | repiping contractor |

Informational and DIY searches are not scored unless a future methodology documents their role. The V1 universe avoids them.

A disabled condition removes the corresponding intent and its queries before hashing. If `emergency_service`, `near_me_demand`, or `city_modified_demand` is false, those classes do not appear in the universe at all. They are not scored as N/A while still contributing to demand-weighted coverage.

### Queries

Each query points to an intent and records the text, surfaces, demand, weight, role, brand status, and whether it is a grid query.

Core scoring queries are non-branded. Branded queries are diagnostic. A core query cannot be branded; the scorer rejects it.

### Prompts

AI prompts derive from the same intent IDs as the search queries. They are not a separate GEO universe.

Example:

```text
INTENT: emergency plumber
Search queries:
  emergency plumber
  emergency plumber near me
  emergency plumber Example County
AI prompts:
  Who can help with an emergency plumbing problem in Example County today?
  Which plumbers in Example County handle emergency calls?
```

Each prompt records a template ID, platform, language, repeat default, and role. The templates are versioned and reviewed with the universe.

## Demand weighting

Each core service cluster receives equal cluster weight. Within a cluster, intent weight is proportional to `sqrt(max(search_volume, 1))`, water-filled so no intent exceeds 50% of its cluster.

This has two effects:

- a head term cannot dominate every other service;
- a service with many queries cannot dominate a service with few queries.

CPC is stored as demand context. It is not a ranking-quality signal, and owner-reported profitability is not part of the public score.

Each intent records a `demand.source`. A live run starts with `configured_market_config` and updates to `dataforseo_keyword_overview` only for services whose volume the provider returned. Synthetic examples use `synthetic_fixture`.

## The hash

The hash covers everything that affects scoring:

- schema and universe versions,
- trade and market,
- language and device,
- services, intents, queries, prompts,
- demand model,
- quality gates.

It excludes volatile review metadata (`created_at`, `locked_at`, `review`) so a reviewer can re-approve a universe without invalidating a score.

The hash is carried into:

- `audit.json` (`run.query_universe_hash`),
- `audit.filled.json` (`query_universe.hash`, `run.query_universe_hash`),
- `scores.json` (`query_universe_hash`, `meta.query_universe_hash`),
- `verification.json` (`query_universe_hash`),
- the report footer.

## Reproducing a universe

```sh
npm run universe -- \
  --config config/market.example.json \
  --out /tmp/query-universe.json
```

The CLI records `configured_market_config` by default. For a synthetic fixture, pass `--demand-source synthetic_fixture` so the provenance matches the fixture.

Check an existing universe:

```sh
npm run universe -- \
  --config config/market.example.json \
  --check /tmp/query-universe.json
```

The builder performs no network access and reads no credentials.

## Review checklist

Before locking a universe:

- [ ] The services are the services the business actually sells.
- [ ] The market is the market the business actually serves.
- [ ] The intent classes cover the commercially meaningful demand.
- [ ] Core queries are non-branded.
- [ ] Branded queries are diagnostic.
- [ ] AI prompts derive from the same intent IDs.
- [ ] Demand weights are bounded and documented.
- [ ] A human has reviewed the query list for relevance and ambiguity.
- [ ] The universe is locked and hashed.
- [ ] The hash is recorded in the run.

If the universe changes after collection, the run is invalid. Start a new run.
