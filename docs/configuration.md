# Configuration

A live audit starts with a market configuration. The synthetic example is `config/market.example.json`.

## The shape

```json
{
  "schema_version": "1.0",
  "template": "market-config-v1",
  "business": {
    "name": "Acme Plumbing (synthetic)",
    "trade": "plumbing",
    "domain": "acme-plumbing.example",
    "phone": "(555) 010-0200",
    "place_id": "SYNTHETIC-PLACE-ACME-001",
    "aliases": []
  },
  "market": {
    "name": "Example County, CA",
    "region": "CA",
    "country": "US",
    "language": "en",
    "device": "mobile",
    "center": { "lat": 34.0, "lng": -117.0 },
    "radius_km": 12,
    "location_code": 2840
  },
  "configuration": {
    "trade": "plumbing",
    "market": "Example County, CA",
    "emergency_service": true,
    "near_me_demand": true,
    "city_modified_demand": true,
    "local_finder_configured": false,
    "branded_diagnostics_enabled": true,
    "historical_runs_available": false,
    "ai_repeats": 3,
    "grid_size": 7,
    "max_queries": 40
  },
  "services": [],
  "branded_queries": [],
  "ai_platforms": ["google_ai_mode", "chatgpt"],
  "known_competitors": [],
  "serp_occupiers": []
}
```

## Business identity

Use the most stable identifiers available:

- canonical name,
- domain,
- place ID,
- phone,
- known aliases.

`place_id` is the strongest identifier. A domain is also strong for organic and authority comparison. A phone is useful when the business has no domain.

The target must resolve with confidence ≥ 0.80. If it cannot, the run fails a validity gate.

## Market

`center` and `radius_km` define the geo-grid. `location_code` is the provider location used for organic queries and AI model data. `language` and `device` are recorded in the universe and the audit.

The market name is part of the query universe. If it changes, the universe hash changes and a historical score is no longer directly comparable.

## Conditions

| Condition | Enables |
|---|---|
| `emergency_service` | Emergency intent coverage |
| `near_me_demand` | Near-me intent coverage |
| `city_modified_demand` | Service + city and city-modified organic checks |
| `local_finder_configured` | Local Finder observation check |
| `branded_diagnostics_enabled` | Branded/non-branded dependence check |
| `historical_runs_available` | Reproducible visibility trend check |

A disabled condition makes its check N/A. It does not lower the score.

## Services

Each service has:

```json
{
  "id": "water_heater_repair",
  "label": "water heater repair",
  "priority": "primary",
  "symptoms": ["water heater not working", "no hot water"],
  "demand": { "volume": 1900, "cpc": 15.2, "trend": 0.03 }
}
```

`priority` influences the opportunity label, not the raw rank. `symptoms` generate problem/symptom intents. Demand data supplies the bounded weighting.

## Competitors

`known_competitors` is the locked business-competitor cohort. It must contain real local service businesses, not directories.

`serp_occupiers` is the directory/publisher cohort. Examples: Yelp, Angi, BBB, Reddit, YouTube, Nextdoor. They are recorded separately and excluded from contractor share.

The cohort is locked before collection. Do not select competitors after seeing which comparison flatters the business.

## AI

`ai_platforms` selects the validated surfaces. V1 supports `google_ai_mode` and `chatgpt`.

`ai_repeats` controls how many times each prompt is observed. The default is three. Increase it before drawing a firm conclusion from a volatile surface.

## Grid

`grid_size` is 3, 5, 7, or a documented custom size. `radius_km` is the distance from the center to the grid edge. The default is 7 × 7 / 49 points.

The grid geometry, method, version, and hash are recorded in the audit.

## Query ceiling

`max_queries` is a safety ceiling. The collector refuses a universe with more core queries than the ceiling. Reduce the services or raise the ceiling explicitly.

## Pricing

`config/pricing.example.json` deliberately contains no prices. Copy it outside the repository, fill in your contracted task prices, and pass it with `--pricing`.

`--max-cost-usd` requires a pricing file. If a reliable price is unavailable, the tool says so rather than inventing one.

## Environment

```sh
export DATAFORSEO_LOGIN="..."
export DATAFORSEO_PASSWORD="..."
```

Optional local controls:

```sh
export LV_REQUEST_TIMEOUT_MS=15000
export LV_MAX_CONCURRENCY=4
export LV_MAX_SERP_TASKS=5000
export LV_MAX_AI_TASKS=250
export LV_MAX_RUN_COST_USD=25
```

The application never loads `.env` automatically. `.env.example` contains variable names only.

## Client-specific configuration stays local

`config/*.json` is gitignored except `config/market.example.json` and `config/pricing.example.json`. A real client configuration stays local.

Do not commit:

- a real client's exact market geometry;
- a real competitor research package;
- a real query universe tied to a client;
- a real pricing agreement.
