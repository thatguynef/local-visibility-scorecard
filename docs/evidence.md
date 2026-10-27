# Evidence

Every finding in a report ends in one evidence state. The state tells the reader how much the audit can prove.

## The four states

| State | Use when | Example |
|---|---|---|
| **VERIFIED** | Directly observed or safely measured. | The business appears at rank 4 in the Local Pack for 21 of 49 grid points. |
| **STRONG SIGNAL** | The observation is real, but the business consequence cannot be proven from public data. | The business is mentioned in AI answers but rarely cited; the effect on leads is not observable. |
| **OWNER DATA REQUIRED** | The question needs Search Console, analytics, CRM, call, booking, or financial data. | Did non-branded clicks become qualified leads? |
| **NOT APPLICABLE** | The check does not reasonably apply to this business, configuration, geography, or audit mode. | Local Finder is not configured. |

`NOT APPLICABLE` is not a synonym for "unknown" or "provider failed." A missing observation is a validity-gate problem, not an N/A check.

## Provenance

Every normalized source records enough metadata to interpret and reproduce it:

```json
{
  "id": "google-maps",
  "provider": "dataforseo",
  "type": "serp",
  "method": "standard",
  "endpoint_family": "serp",
  "surface": "google_maps",
  "collected_at": "2026-01-01T00:00:00Z",
  "collector_version": "1.0.0",
  "location_method": "coordinate",
  "language": "en",
  "device": "mobile",
  "field_completeness": 80
}
```

Every observation points to a source ID. The scorer rejects an evidence reference that is not in `sources`.

For AI observations, provenance also includes:

- platform,
- product surface,
- `source_type` (`consumer_surface` or `model_api`),
- method,
- provider,
- prompt ID and text,
- market and language,
- repeat number,
- model/version where available,
- citation behavior.

## Target resolution

Before scoring visibility, the collector resolves the target business. It uses, in order of strength:

1. place ID,
2. domain,
3. phone,
4. name alias,
5. manual verification.

The audit records `match_method` and `match_confidence` for every target observation. A confidence below 0.80 does not count as a resolved target. If the business cannot be resolved reliably, the run fails a validity gate. It never converts an identity-resolution failure into "rank not found."

## Confidence

`confidence` is not a synonym for "how strongly the analyst feels." It is a property of the evidence:

- a deterministic check must be `verified`;
- a judgment check may be `verified` or `strong_signal`;
- a check with no evidence cannot be scored.

The verifier compares the confidence label to the check type and the rendered report. A mismatch fails verification.

## Source methods and surfaces

A surface is not a method. The audit records both.

| Surface | What it means |
|---|---|
| `google_local_pack` | The local-pack block in ordinary Google results |
| `google_maps` | Google Maps results at a coordinate |
| `google_local_finder` | Local Finder results where configured |
| `google_organic` | Ordinary organic results |
| `google_ai_mode` | Google AI Mode consumer/search answer |
| `chatgpt` | ChatGPT observation through a model/API provider |

Local Pack, Maps, and Local Finder can order the same businesses differently. The framework records them separately and never merges their ranks into one number.

## AI evidence

Mention, recommendation, and citation are separate fields:

```json
{
  "target_mentioned": true,
  "target_recommended": false,
  "target_cited": false,
  "target_entity_accuracy": "accurate"
}
```

Do not collapse them into `"AI visibility": "yes"`.

Every repeat is recorded separately. The majority rule is documented in [Scoring](scoring.md#ai-aggregation). A model/API response is never labeled as a consumer/search surface observation.

## Missing observations

A missing observation is reported as `not_collected`, never as rank 0. The metrics engine excludes it from rank calculations, and the validity gate checks whether core coverage is sufficient.

If a provider fails for a small subset of observations but enough valid evidence remains, the audit can still be scored and the limitation is reported. If core coverage falls below the threshold, the run is `INSUFFICIENT EVIDENCE`.

## What never enters evidence

- DataForSEO login, password, or Basic Authorization values.
- Raw provider responses from a real audit.
- Cookies, browser profiles, HAR files, or session data.
- Customer names, emails, phone numbers, street addresses, or review text.
- Real client geo-grid coordinates in a tracked example.
- Search Console, analytics, CRM, or revenue exports in a public example.
- A model's free-form prose as a substitute for a check score.

## Owner data

Owner-data questions are evidence of a different kind: the business knows the answer, and the public web does not. They are reported with `publicScoreImpact: none`.

The report should say:

> Owner data required. Search Console can show whether these impressions produced clicks.

It should not say:

> The business is probably losing leads because the owner did not provide data.

## What the verifier checks

The verifier independently checks:

- source IDs and provenance,
- evidence and confidence on every applicable check,
- target-match confidence,
- validity gates,
- AI source-type separation,
- deterministic check derivation,
- the query-universe hash,
- report values and labels.

If a finding cannot be traced to a source and a check, it does not belong in the report.
