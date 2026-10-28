---
description: "How the Local Visibility, GBP, and Website Scorecards fit together without duplicate scoring — the ownership matrix and RAD boundary."
---

# The Scorecard Family

Local Visibility Scorecard is the third member of a coordinated family. It is designed to sit beside [GBP Scorecard](https://github.com/thatguynef/gbp-scorecard) and [Website Scorecard](https://github.com/thatguynef/website-scorecard) without copying their jobs.

```text
LOCAL VISIBILITY SCORECARD
Can prospective customers discover the business?
Search · Maps · AI answers · competitors · authority
                 ↓

GBP SCORECARD
Does the Google Business Profile create trust and enable action?
Identity · Services · Reviews · Content · Conversion · Handoff
                 ↓

WEBSITE SCORECARD
Can the owned website convert that demand?
UX · Trust · Mobile · Contact · Booking · Measurement
                 ↓

RAD
Remediation and operations live elsewhere.
```

## What is deliberately shared

| Convention | Shared rule |
|---|---|
| Scale | 0–100, seven weighted categories, A–F bands |
| Bands | A 90–100 · B 75–89 · C 60–74 · D 40–59 · F 0–39 |
| Evidence states | `VERIFIED` · `STRONG SIGNAL` · `OWNER DATA REQUIRED` · `NOT APPLICABLE` |
| Public score | Owner-data questions never reduce it |
| N/A handling | N/A checks leave the denominator; weights are renormalized |
| Pipeline | Collect → Review → Score → Render → Verify. Each stage is independently runnable |
| Outputs | `audit.json`, `audit.filled.json`, `scores.json`, `one-page.md`, `full-report.md`, `verification.json` |
| Judgment | `judgment.json` is structured and isolated |
| Determinism | Same inputs produce the same score and the same tables |
| Privacy | Raw evidence and client reports stay local; public examples are synthetic or sanitized |
| Visual system | Ink `#0B0B0C`, Surface `#141416`, Card `#1C1C1F`, Paper `#F7F7F5`, Muted `#A6A6AA`, Brand Red `#FF3B3B`, Soft Red `#FF8F8F`, Green `#3FBF7F`, Amber `#F5C766` |
| Voice | Calm, direct, evidence-based. Observed, not observed, may create friction, owner data required |
| Hard caps | Only for extreme discovery failures, each deterministic, tested, and documented |
| RAD boundary | RAD mappings are metadata. The scorecard is useful without RAD |

## What belongs only to Local Visibility

- Local Pack visibility.
- Google Maps and geo-grid visibility.
- Local Finder observations where configured.
- Organic ranking and ranking-URL relevance for local commercial intent.
- Google AI Mode visibility (an AI Overview adapter is future work).
- AI/LLM mention, recommendation, and citation behavior.
- Business-competitor share of visibility.
- External entity and citation footprint outside the GBP.
- Referring-domain authority comparison.
- Visibility concentration and resilience.
- Reproducible visibility trends.

## What belongs only to GBP Scorecard

- GBP identity, categories, services, hours, attributes, and media.
- Public review recency, velocity, distribution, and owner responses.
- Profile action paths: call, website, booking, messaging, directions.
- The Google → destination handoff.
- Profile-origin attribution signals.
- Owner-data questions about calls, messages, bookings, reviews, and profile revenue.

## What belongs only to Website Scorecard

- Website UX, mobile layout, page speed, accessibility, forms, navigation, and content depth.
- Website conversion paths, including form usability and on-site scheduling.
- Website analytics and tag configuration.
- On-site schema and technical implementation.
- Website-specific hard caps, including broken forms and unreadable mobile layouts.

## No duplicate scoring

| Question | Local Visibility | GBP Scorecard | Website Scorecard |
|---|---|---|---|
| Local Pack rank | SCORE | explanatory only | — |
| Google Maps rank | SCORE | explanatory only | — |
| Geo-grid visibility | SCORE | — | — |
| Organic rank and ranking URL | SCORE | — | explanatory only |
| AI mention, recommendation, citation | SCORE | — | — |
| Competitor share of visibility | SCORE | — | — |
| Relevant referring domains and external corroboration | SCORE | — | — |
| GBP category quality | explanatory only | SCORE | — |
| GBP services, hours, attributes, photos | explanatory only | SCORE | — |
| GBP reviews and owner responses | — | SCORE | — |
| GBP phone, website, booking, messaging action | — | SCORE | — |
| GBP-to-website handoff | — | SCORE | — |
| Page speed and mobile UX | — | — | SCORE |
| Website forms, CTA usability, booking flow | — | — | SCORE |
| On-site schema and technical implementation | — | — | SCORE |
| Website conversion tracking | — | — | SCORE |
| Review widget on website | — | — | SCORE |
| Paid search or Local Services Ads presence | diagnostic, never scored | — | — |
| Branded search visibility | diagnostic, never scored | — | — |
| Search Console clicks, leads, revenue | OWNER DATA REQUIRED | OWNER DATA REQUIRED | OWNER DATA REQUIRED |

## What a Local Visibility finding looks like

> The business appears in the Local Pack for only 11% of tracked water-heater grid observations.

Do **not** add:

> The GBP primary category appears weak.

Instead:

> Cross-reference GBP Scorecard if profile relevance or configuration needs diagnosis.

## What a Website finding looks like

Local Visibility may say:

> The water-heater page has no top-10 visibility for the target market.

Website Scorecard may say:

> The water-heater page has weak mobile conversion.

Those are separate findings. They are not merged into one number.

## Deliberate divergence

Local Visibility weights **Maps & Local Pack at 25**, because local-business results are the densest discovery surface for a home-service business. GBP weights **Conversion & Actionability at 22**, because a profile's job is to produce a next step. Website weights **Contact at 22** for the same reason on the owned site.

All three use seven categories so a business owner can compare the shape of the diagnosis, not the underlying checks.

## Future boundary

The family may eventually feed machine-readable findings into RAD:

```json
{
  "finding": "LV-MAP-01",
  "recommended_modules": ["market_intelligence"]
}
```

The scoring engines remain separate. RAD consumes findings; it does not merge the rubrics or rewrite a public score with private operational metrics.

## Published sites

- [Local Visibility Scorecard](https://thatguynef.github.io/local-visibility-scorecard/)
- [GBP Scorecard](https://thatguynef.github.io/gbp-scorecard/)
- [Website Scorecard](https://thatguynef.github.io/website-scorecard/)
