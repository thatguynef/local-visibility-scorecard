# Scoring

The score is a 0–100 summary of observable local discovery. It is deterministic: the same collected audit artifacts produce the same score.

## Bands

| Score | Band | Label |
|---:|---|---|
| 90–100 | A | Elite |
| 75–89 | B | Strong |
| 60–74 | C | Average |
| 40–59 | D | Weak |
| 0–39 | F | Critical |

Bands use the display score, which is the final score rounded half-up to the nearest integer.

## Formula

For each category:

```text
normalized = category.max × earned / applicable_max
```

For the total:

```text
total = sum(normalized for applicable categories) × 100 / sum(category.max for applicable categories)
final = min(total, active overall cap)
display = round_half_up(final)
```

Category normalized values are rounded to two decimals. The total and final are rounded to one decimal. The display is rounded to the nearest integer.

A category with no applicable checks is removed from the denominator. A category with one N/A check keeps its configured weight but scores only the applicable checks.

## N/A and normalization

`NOT APPLICABLE` means the check does not apply to this business, configuration, or audit mode. It does not mean "unknown," "provider failed," or "the business is bad."

Examples in the V1 configuration:

- Local Finder is not configured → `LV-MAP-10` is N/A.
- No comparable prior run exists → `LV-RES-05` is N/A.

N/A checks are removed from `applicable_max`. The category's configured weight does not change; the category is normalized across the checks that do apply. This is why two runs with different configurations can have different applicable maxima but still be compared on the 0–100 scale.

A temporary provider failure is **not** N/A. It fails a validity gate and produces `INSUFFICIENT EVIDENCE`.

## Visibility metric definitions

### Rank credit

For a query/surface observation:

| Rank | Credit |
|---:|---:|
| 1–3 | 1.0 |
| 4–10 | 0.7 |
| 11–20 | 0.3 |
| Outside top 20 / not found | 0.0 |

### Top-N coverage

A query counts as top-N when the best observed rank on that surface is at most N. For Maps, coverage is computed across grid observations; a query's coverage is the share of grid points where the target is in the band. Demand-weighted coverage weights each query by its intent weight.

### Demand weighting

Each core service cluster receives equal cluster weight:

```text
cluster_weight = 1 / number_of_core_service_clusters
```

Within a cluster, raw intent weight is proportional to:

```text
sqrt(max(search_volume, 1))
```

The raw weights are water-filled so no intent exceeds 50% of its cluster before renormalization. This prevents one head term from dominating every other commercially important service.

CPC is stored as demand context and is never used as a ranking-quality signal.

### Geo-grid

A 7×7 grid is 49 points across the configured radius. A grid point is covered for an intent when the target appears in the top 10 at that point for that intent. Geo-grid consistency is the demand-weighted average of per-intent point coverage. Quadrant coverage splits the grid into NE, NW, SE, and SW around the center.

The grid configuration records the center, radius, point coordinates, generation method, version, and hash. Local Pack, Maps, and Local Finder are separate surfaces and are never merged into one rank.

### AI aggregation

Each prompt-platform pair is observed R times. Mention, recommendation, and citation status for the pair is true when it appears in at least `ceil(R/2)` repeats.

- **Mention coverage:** share of validated prompt-platform pairs where the target is mentioned.
- **Recommendation coverage:** share where it is recommended, not merely mentioned.
- **Citation coverage:** share where its domain or entity is cited as a source.
- **Prompt-intent coverage:** share of canonical prompt intents with at least one mention or recommendation.
- **Repeat stability:** share of pairs where every repeat agrees on mention status.
- **Surface breadth:** share of validated AI surfaces with at least one mention.

Consumer/search surfaces (`source_type=consumer_surface`) and model/API surfaces (`source_type=model_api`) are never pooled into one opaque metric.

## Validity gates

The scorer refuses to write a score when a required gate fails. The response is:

```text
INSUFFICIENT EVIDENCE
```

not a low business score. The gates are:

| Gate | Threshold |
|---|---|
| Artifact schema is valid | V1 schema and known `schema_version` |
| Target business resolved | `resolved=true`, match confidence ≥ 0.80 |
| Query universe locked | Locked, hash present, hash matches content |
| Market configuration matches | Trade, market, language, device |
| Core query coverage | ≥ 80% of planned core queries on each required surface |
| Geo-grid coverage | ≥ 80% of planned grid points per Maps surface |
| Validated AI surface available | At least one validated surface with observations |
| AI repeat completeness | ≥ 80% of planned prompt-platform-repeat observations |
| Competitor cohort locked | Locked, at least two business competitors |
| Authority data present | At least one referring domain or listing |
| Provider error rate | ≤ 0.10 |
| No critical source outage | No required core source in critical outage |

The verifier independently recomputes these gates from the normalized observations. A gate cannot be waived by editing `validity.gates`.

## Hard caps

V1 carries one cap.

**No qualified non-branded discovery.** If the business has zero qualified presence across every required core non-branded discovery surface, despite sufficient valid evidence, the overall score is capped at **25 / 100**. The trigger is deterministic:

```json
{ "fact": "non_branded_discovery_present", "equals": false }
```

The cap is applied once, after category normalization and before the display score. It is tested in the scorer unit tests and the verifier mutation suite.

There is no cap for missing paid ads, a single AI mention, low backlink count, low review count, or a missing optional platform. Those are not universal discovery failures.

## Worked example — synthetic Acme Plumbing

| Category | Earned | Applicable max | Weight | Normalized |
|---|---:|---:|---:|---:|
| A. Intent & Demand Coverage | 8 | 15 | 15 | 8.00 |
| B. Maps & Local Pack Visibility | 13 | 23 | 25 | 14.13 |
| C. Organic Search Visibility | 8 | 15 | 15 | 8.00 |
| D. AI & Generative Visibility | 16 | 20 | 20 | 16.00 |
| E. Competitive Share of Visibility | 4 | 10 | 10 | 4.00 |
| F. Authority & Entity Footprint | 6 | 10 | 10 | 6.00 |
| G. Visibility Resilience | 3 | 4 | 5 | 3.75 |
| **Total** | | | **100** | **59.88** |

`LV-MAP-10` and `LV-RES-05` are N/A. The applicable weight remains 100 because both categories still have applicable checks. The total is 59.9, the display is 60, and the band is **C (Average)**. No cap is active.

The example is synthetic. The score is the rubric's output, not a target.

## Reproducing a score

A historical score can be reproduced when you have:

- the same `audit.filled.json`,
- the same rubric version,
- the same `scorer_version`,
- the same query-universe hash,
- the same grid hash.

The scorer recomputes the query-universe hash and refuses a mismatch. The verifier recomputes metrics, deterministic check scores, and validity gates from the normalized observations.

## Owner data

Owner-data questions are reported separately. They never change the public score. A business that cannot provide Search Console, CRM, or revenue data is not penalized; the report simply states what remains unknown.

## What the score does not mean

- It does not prove that a visibility gap cost a specific job.
- It does not predict revenue.
- It does not compare a plumber with a roofer unless the same market, query universe, and competitor cohort are used.
- It does not judge the Google Business Profile or the website.
- It does not treat a directory as a local contractor competitor.

Read [Evidence](evidence.md) for the evidence states and provenance rules.
