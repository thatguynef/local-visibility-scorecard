---
description: "Deterministic check-to-fix mappings, priority order, and cross-scorecard routing for the Local Visibility Scorecard."
---

# Fix Library

> **Generated from `rubric.json`.** Do not edit by hand. Run `python3 render_fix_library.py`.

The fix library is a deterministic mapping from a failed check to a bounded intervention. It is not a sales menu. A recommendation is evidence-backed only when the corresponding check lost points and the evidence supports the finding.

A service mapping is metadata. The scorecard remains useful without RAD, and the existence of an optional service is never the reason a business loses points.

## Priority order

| Priority | Meaning |
|---|---|
| critical | Can leave the business undiscoverable for commercially important demand. |
| high | Materially reduces visibility on a surface, service, or area that matters. |
| medium | Creates a measurable gap or fragility, but a workaround exists. |
| low | Improves durability or measurement without changing the core discovery picture. |

## Check mappings

| Check | Priority | Failure | Fix | Service mapping | Cross-scorecard |
|---|---|---|---|---|---|
| LV-AI-01 | critical | AI mention coverage | Analyze the prompt intents and surfaces where the business is absent. Distinguish mention from recommendation before prescribing a fix. | `market_intelligence` | market_intelligence |
| LV-AI-02 | critical | AI recommendation coverage | Analyze the citation and corroboration ecosystem, not just content. A recommendation usually depends on third-party evidence. | `market_intelligence` | market_intelligence |
| LV-INT-02 | critical | Demand-weighted non-branded coverage | Rebuild the content and entity strategy around the uncovered demand, starting with the highest-weight clusters. Do not optimize a head term at the expense of every other service. | `market_intelligence` | market_intelligence |
| LV-MAP-01 | critical | Demand-weighted Local Pack Top-3 coverage | Investigate relevance, proximity, authority, service-area competition, and profile configuration. Cross-reference GBP Scorecard for profile diagnosis. | `market_intelligence` | market_intelligence |
| LV-MAP-05 | critical | Google Maps Top-3 coverage | Diagnose Maps separately. Check proximity, category relevance, and geographic coverage before assuming a content problem. | `market_intelligence` | market_intelligence |
| LV-AI-03 | high | AI citation and source coverage | Build citable, source-worthy content and third-party corroboration. Do not claim a citation you cannot observe. | `market_intelligence` | market_intelligence |
| LV-AI-04 | high | Service relevance in AI answers | If relevance is weak, investigate entity ambiguity and content-to-intent mismatch. Do not treat the mention as a win. | `market_intelligence` | market_intelligence |
| LV-AI-05 | high | Location relevance in AI answers | Clarify the service area and entity location. Cross-reference GBP Scorecard for location configuration. | `market_intelligence` | market_intelligence |
| LV-AI-08 | high | Prompt-intent coverage | Expand prompt coverage and investigate the intents where the business never appears. | `market_intelligence` | market_intelligence |
| LV-AUT-01 | high | Relevant referring domains | Pursue a small number of genuinely relevant local, manufacturer, trade, or association sources. Do not buy generic directory links. | `market_intelligence` | market_intelligence |
| LV-AUT-02 | high | Local source relevance | Build relationships with local organizations, publications, and trade sources. Do not treat a generic directory as local proof. | `market_intelligence` | market_intelligence |
| LV-AUT-04 | high | External listing and entity consistency | Correct the highest-authority inconsistent listings first. Cross-reference GBP Scorecard for the primary profile. | `market_intelligence` | market_intelligence |
| LV-CMP-01 | high | Business-competitor share of Top-3 | Identify the competitors winning the appearances and the surfaces where they win. Do not count directories as contractors. | `marketing_intelligence` | marketing_intelligence |
| LV-CMP-02 | high | Business-competitor share of Top-10 | Compare service by service. A market-wide average can hide a single-service collapse. | `marketing_intelligence` | marketing_intelligence |
| LV-CMP-06 | high | Service-specific competitor gap | Prioritize the clusters where the gap is largest and the service matters commercially. | `marketing_intelligence` | marketing_intelligence |
| LV-INT-01 | high | Core service clusters with any qualified visibility | Prioritize the service clusters with no qualified visibility. Confirm the business actually sells them before treating the gap as a defect. | `market_intelligence` | market_intelligence |
| LV-INT-03 | high | High-commercial-intent coverage | Focus the next content and profile work on the commercial intents that are absent. | `market_intelligence` | market_intelligence |
| LV-INT-04 | high | Emergency or urgent intent coverage | Treat emergency visibility as a service-line decision: either build a credible urgent path or state that the business does not offer one. | `market_intelligence` | market_intelligence |
| LV-INT-05 | high | Service + city intent coverage | Create or improve the location-specific service pages and confirm the market is actually served. | `market_intelligence` | market_intelligence |
| LV-MAP-02 | high | Local Pack Top-10 coverage | Look for the service and geographic clusters where the business disappears, not just the market average. | `market_intelligence` | market_intelligence |
| LV-MAP-06 | high | Google Maps Top-10 coverage | Compare Maps and Local Pack results. A gap between them is diagnostic, not noise. | `market_intelligence` | market_intelligence |
| LV-MAP-07 | high | Geo-grid consistency | Use the grid and quadrant summary to find the areas where the business disappears. Do not average the gap away. | `market_intelligence` | market_intelligence |
| LV-MAP-08 | high | Service-specific Maps coverage | Separate the strong service from the weak service in the report. The fix is usually service-specific, not market-wide. | `market_intelligence` | market_intelligence |
| LV-ORG-01 | high | Demand-weighted organic Top-3 coverage | Investigate the pages that rank, the intent match, and the authority gap. Cross-reference Website Scorecard for page quality. | `market_intelligence` | market_intelligence |
| LV-ORG-02 | high | Organic Top-10 coverage | Focus on the service clusters with no top-10 presence. Confirm a relevant page exists before recommending content. | `market_intelligence` | market_intelligence |
| LV-ORG-05 | high | Ranking URL relevance to intent | Map each commercial intent to a page that genuinely serves it. Do not score page speed, forms, or UX here; those belong to Website Scorecard. | `market_intelligence` | market_intelligence |
| LV-AI-06 | medium | Entity accuracy in AI answers | Correct the underlying entity footprint and cross-reference GBP Scorecard identity checks. Do not edit an AI answer directly. | `market_intelligence` | market_intelligence |
| LV-AI-07 | medium | Competitive share of AI answers | Compare the sources AI systems cite for the competitors. The gap is usually corroboration, not prompt wording. | `market_intelligence` | market_intelligence |
| LV-AI-09 | medium | AI repeat stability | Increase repeats before drawing a conclusion. Report unstable prompts separately. | `market_intelligence` | market_intelligence |
| LV-AI-10 | medium | Validated AI surface breadth | Distinguish consumer/search surfaces from model/API surfaces in the report. Do not treat them as equivalent. | `market_intelligence` | market_intelligence |
| LV-AUT-03 | medium | Industry, manufacturer, and trade sources | Pursue manufacturer/dealer listings, trade associations, and credible trade publications where the business qualifies. | `market_intelligence` | market_intelligence |
| LV-AUT-05 | medium | Competitor authority gap | Compare the sources the leading competitors have that the business does not. Prioritize relevance over volume. | `market_intelligence` | market_intelligence |
| LV-AUT-06 | medium | Authority overlap with AI citations | Prioritize sources that both corroborate the entity and appear in AI citations. | `market_intelligence` | market_intelligence |
| LV-CMP-03 | medium | Maps share of visibility | If Maps share is weak, investigate proximity and local relevance before content. | `marketing_intelligence` | marketing_intelligence |
| LV-CMP-04 | medium | Organic share of visibility | If organic share is weak, investigate page-to-intent coverage and authority. | `marketing_intelligence` | marketing_intelligence |
| LV-CMP-05 | medium | AI recommendation share | Compare the cited sources. AI recommendations often follow corroboration, not direct optimization. | `marketing_intelligence` | marketing_intelligence |
| LV-CMP-07 | medium | Geographic competitor gap | Use the quadrant comparison to decide whether the gap is geographic or service-specific. | `marketing_intelligence` | marketing_intelligence |
| LV-INT-06 | medium | Near-me intent coverage | Check proximity, service-area configuration, and the strength of the local entity footprint before adding pages. | `market_intelligence` | market_intelligence |
| LV-INT-07 | medium | Problem and symptom intent coverage | Map content to the symptoms the business actually solves. Do not publish generic DIY content that cannot produce a service lead. | `market_intelligence` | market_intelligence |
| LV-MAP-03 | medium | Local Pack Top-20 coverage | Prioritize complete absence over rank improvement. A missing entity is a different problem from a weak rank. | `market_intelligence` | market_intelligence |
| LV-MAP-04 | medium | Average visible Local Pack position | Use this as context, not as the primary score. Coverage and geographic consistency are more robust. | `market_intelligence` | market_intelligence |
| LV-MAP-09 | medium | Geographic gap severity | Check whether the weak quadrant is actually served. If it is, investigate proximity and location-page coverage. | `market_intelligence` | market_intelligence |
| LV-MAP-10 | medium | Local Finder coverage | Treat Local Finder as a separate observation. Do not merge it into the Maps rank. | `market_intelligence` | market_intelligence |
| LV-ORG-03 | medium | Organic Top-20 coverage | Prioritize complete absence over marginal rank movement. | `market_intelligence` | market_intelligence |
| LV-ORG-04 | medium | Demand-weighted ranking coverage | Use coverage bands for the primary diagnosis and rank credit as supporting context. | `market_intelligence` | market_intelligence |
| LV-ORG-06 | medium | City-modified organic coverage | Check location-page coverage and the market configuration before adding pages. | `market_intelligence` | market_intelligence |
| LV-ORG-07 | medium | Service-cluster organic coverage | Use the cluster view to decide whether the organic gap is service-specific or market-wide. | `market_intelligence` | market_intelligence |
| LV-RES-01 | medium | Surface concentration | Do not weaken a strong surface. Build a second surface as insurance and report the concentration explicitly. | `market_intelligence` | market_intelligence |
| LV-RES-02 | medium | Service concentration | Decide whether the concentration is intentional. If not, build visibility for the next most important service. | `market_intelligence` | market_intelligence |
| LV-RES-03 | medium | Geographic concentration | Check whether the concentration matches the service area. If not, investigate proximity and location coverage. | `market_intelligence` | market_intelligence |
| LV-RES-04 | medium | Branded versus non-branded dependence | Separate branded from non-branded demand in every report. Do not let branded rank inflate the core score. | `market_intelligence` | market_intelligence |
| LV-RES-05 | low | Reproducible visibility trend | Investigate lost visibility by surface and service. Do not invent a trend when the prior run is not comparable. | `market_intelligence` | market_intelligence |

## Opportunity flags

These are never scored. Recommend them only when the evidence and the business model support them.

| Opportunity | Service mapping | Why it may matter |
|---|---|---|
| Paid search coverage | `marketing_intelligence` | Paid search can cover high-intent demand that organic and Maps visibility do not reach, but its absence is never a score penalty. |
| Local Services Ads | `marketing_intelligence` | Local Services Ads can place a home-service business above the Local Pack for urgent demand. |
| Bing and secondary search coverage | `market_intelligence` | Secondary engines can be a low-cost incremental discovery surface for some local trades. |
| Apple Maps presence | `market_intelligence` | iPhone users may discover a local business outside Google. |
| Bing Maps presence | `market_intelligence` | Bing Maps and Bing local results can corroborate the same entity. |
| Nextdoor and neighborhood presence | `marketing_intelligence` | Neighborhood recommendations can matter for service-area businesses. |
| Yelp and marketplace profile | `marketing_intelligence` | Some markets and trades see meaningful discovery through marketplaces even when they are not the primary surface. |
| YouTube and video discovery | `market_intelligence` | Video can occupy SERP features and corroborate the work a business claims to do. |
| Local sponsorship and community presence | `market_intelligence` | Local sponsorships can create relevant local citations and entity corroboration. |
| Manufacturer or dealer directory | `market_intelligence` | A relevant manufacturer or dealer listing can be a strong, trade-specific corroborating source. |
| Local media and PR | `market_intelligence` | Credible local publications can strengthen the entity footprint and AI citation ecosystem. |
| AI citation-source development | `market_intelligence` | AI answers cite sources. Relevant, citable content and third-party corroboration can improve the chance of being referenced. |
| New service-area market | `market_intelligence` | The audit may reveal a geographic visibility gap that is better addressed by a deliberate market decision than by more content. |
| Service and location content expansion | `market_intelligence` | Organic and AI visibility can be limited by the absence of pages that match the tracked intent. |

## Cross-scorecard routing

A Local Visibility finding may require a sibling diagnosis. Route the question; do not score it twice.

| Finding | Route to | Why |
|---|---|---|
| The business is absent from Maps or the Local Pack for a service it sells | GBP Scorecard | Confirm category, services, location, and profile configuration before treating it as a pure visibility defect. |
| Maps is strong but organic visibility is weak | Website Scorecard + content diagnosis | Check whether a service page exists and matches the intent; Website Scorecard judges page quality, not Local Visibility. |
| The ranking URL is generic or unrelated | Website Scorecard | Local Visibility can identify the URL. Website Scorecard judges whether the page itself serves the customer. |
| The business is mentioned by AI but rarely recommended or cited | Market intelligence / authority work | Investigate entity corroboration, third-party sources, and citable content. |
| A competitor outranks the business across the market | Market intelligence | Compare source ecosystems, service coverage, and geographic presence. |
| The business has no non-branded discovery at all | Market intelligence | Treat as a strategic visibility problem; confirm the market and services are correct before prescribing tactics. |

## How to use a mapping

1. Confirm the check is applicable and lost points.
2. Confirm the evidence state: VERIFIED or STRONG SIGNAL.
3. Use the check's recommended intervention, not a generic checklist fix.
4. Keep the report's points claim within the recoverable points.
5. Treat the service mapping as an optional implementation path, not a diagnosis.
6. If the finding belongs to a sibling scorecard, route it instead of scoring it here.

## What not to do

- Do not recommend a service merely because it exists.
- Do not claim a revenue lift from a fix.
- Do not bundle unrelated checks into one oversized claim.
- Do not use a model to choose a service; use the deterministic mapping.
- Do not recommend a fix that requires private data the audit does not have.
- Do not treat a directory or publisher as a local contractor competitor.
- Do not pool consumer/search AI surfaces with model/API responses.


---

**Scorecard family boundary:** this reference covers discovery only. The [GBP Scorecard](https://thatguynef.github.io/gbp-scorecard/) diagnoses profile trust and action; the [Website Scorecard](https://thatguynef.github.io/website-scorecard/) diagnoses website conversion. See [The Scorecard Family](https://thatguynef.github.io/local-visibility-scorecard/scorecard-family/).