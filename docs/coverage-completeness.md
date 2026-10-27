# Coverage and completeness

The score measures visibility outcomes, not how many checks were run. This page explains what is core, what is diagnostic, and what is deliberately excluded.

## Core scored

| Surface or question | Category |
|---|---|
| Non-branded local search across the service clusters | A |
| Local Pack visibility | B |
| Google Maps visibility | B |
| Geo-grid consistency | B |
| Local Finder where configured | B |
| Organic visibility and ranking URL | C |
| Validated AI surfaces | D |
| Business-competitor share | E |
| Relevant authority and entity footprint | F |
| Visibility resilience | G |

## Diagnostic, unscored

### Branded search

Branded queries are tracked so the report can separate easy branded visibility from non-branded discovery. They never inflate the core score. The resilience check can use the branded/non-branded ratio as a diagnostic when the condition is enabled.

### Paid search and Local Services Ads

Paid visibility is conceptually part of local discovery, but its absence must not lower the public score. The normalized audit records paid Maps items and search ads where observed. The report can flag a paid opportunity. It cannot penalize a business for not advertising.

### Secondary discovery surfaces

Bing, Bing Maps, Apple Maps, Yelp, Nextdoor, Houzz, industry directories, and manufacturer directories are optional adapters. V1 does not force a low-quality surface into the score just to appear comprehensive.

### Opportunity flags

Paid search, Local Services Ads, secondary search, Apple Maps, Bing Maps, Nextdoor, Yelp optimization, YouTube, local sponsorship, manufacturer directories, PR, AI citation-source development, new service areas, and content expansion are reported as opportunities when the evidence supports them. They are never the reason a business loses points.

## Owner data

Owner-data questions cover Search Console clicks and CTR, qualified organic leads, organic revenue, AI referrals and leads, local search revenue, paid ROI, and priority services by gross profit.

They are reported with `publicScoreImpact: none`. They never reduce the public score.

## Validity gates

A run is not scoreable until the gates in [Scoring](scoring.md#validity-gates) pass. A gate failure returns `INSUFFICIENT EVIDENCE`.

The purpose is to prevent two common failures:

1. **A provider outage becomes a low business score.** The business did not become invisible; the collector failed.
2. **A missing core surface silently renormalizes the score upward.** If Maps was not collected, removing 25 points from the denominator would make the business look better, not worse.

The second failure is why `NOT APPLICABLE` is reserved for genuine non-applicability. A missing Maps collection is not N/A.

## N/A versus incomplete

| Situation | Treatment |
|---|---|
| Local Finder is not configured | N/A, removed from denominator |
| No comparable prior run | N/A for the trend check |
| The business does not sell emergency work | N/A for emergency coverage |
| A provider times out for 10% of grid points | Still scoreable; the limitation is reported |
| A provider times out for 40% of grid points | `INSUFFICIENT EVIDENCE` |
| The target business cannot be resolved | `INSUFFICIENT EVIDENCE` |
| The query universe changed after collection | `INSUFFICIENT EVIDENCE` |

## Completeness is not a score

A run can have 100% field completeness and a low visibility score. It can have 70% field completeness and a defensible score if the missing fields are not required for the diagnosis.

The score reflects the visibility outcome. The coverage matrix and the validity gates explain what was observed. Neither is a field-completion grade.

## What the user sees

- The one-pager shows the score, three gaps, the visibility matrix, the snapshot, and the limitations.
- The full report shows every check, the geo-grid summary, the AI surface breakdown, provenance, and the opportunity flags.
- The verification record shows every invariant and the mutation suite result.

If a reader cannot tell what was observed, what was not, and what remains owner data, the report is not finished.
