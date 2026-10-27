# Portable Local Visibility Audit Checklist

> **Generated from `rubric.json`.** Do not edit by hand. This is a collection companion, not a replacement for the scorer.

Rubric v1.0.0 · 52 checks · 100 points · 7 journey stages

## Before you start

- Record the audit mode: **public**. Do not use an authorized Search Console, GA4, or Ads session in Public Mode.
- **Define the market before you look at results.** Lock the services, market geometry, grid, language, device, query universe, and AI prompts first.
- Resolve the target business with at least one strong identifier (place ID, domain, or phone). Record the match method and confidence.
- Lock the business-competitor cohort. Directories and publishers are SERP occupiers, not contractors.
- Use `verified` only for a directly observed or safely measured fact. Use `strong_signal` when the observation is real but the consequence is not proven.
- A missing observation is `not_collected`, never rank 0. If core coverage is insufficient, return **INSUFFICIENT EVIDENCE**, not a low score.
- Owner-data questions never reduce the public score.

## Evidence states

| State | Use when |
|---|---|
| VERIFIED | Directly observed or safely measured. |
| STRONG SIGNAL | The observation is real, but the business consequence cannot be proven from public data. |
| OWNER DATA REQUIRED | The question needs Search Console, analytics, CRM, call, booking, or financial data. |
| NOT APPLICABLE | The check does not reasonably apply to this business, category, geography, configuration, or mode. |

## Required provenance

Every source must record: `id`, `provider`, `type`, `method`, `endpoint_family`, `surface`, `collected_at`, `collector_version`, `location_method`, `language`, `device`, `field_completeness`.

For AI observations, also record: platform, product surface, source type (`consumer_surface` or `model_api`), model/version where available, prompt, market, language, repeat number, and citation behavior.

Never record credentials, authorization values, cookies, account information, or customer PII in an audit artifact.

## Query-universe lock

1. List the services the business actually sells and prioritize them.
2. Generate candidate intents across category, service, emergency, near-me, city-modified, problem/symptom, and high-ticket classes.
3. Attach demand evidence (volume, intent, trend, CPC context). Do not treat CPC as a ranking-quality signal.
4. Deduplicate and classify branded versus non-branded. Branded is diagnostic.
5. Mark core versus diagnostic. Core scoring queries must be non-branded.
6. Generate AI prompts from the same intent IDs, never from a separate GEO list.
7. Review, lock, and hash the universe **before** collecting visibility.
8. Carry the hash into `audit.json`, `scores.json`, and `verification.json`.

## Geo-grid lock

1. Center the grid on the market, not on one convenient pin.
2. Choose 3×3, 5×5, 7×7, or a documented custom grid. The delivered-audit default is 7×7 / 49 points.
3. Record the center, radius, point coordinates, generation method, version, and hash.
4. Collect Local Pack, Maps, and Local Finder separately. Never silently merge their ranks.
5. Synthetic fixtures only in tracked examples. Real client coordinates stay local.

## AI observation rules

- Keep **mentioned**, **recommended**, and **cited** as separate fields.
- Record every repeat. Aggregate with the documented majority rule.
- Never label a model/API response as a consumer/search surface observation.
- Only validated surfaces contribute to the core score. Experimental sources are diagnostics.

## 1. Search

*When a local customer searches for the service, does the business appear across the demand it sells?*

### LV-INT-01 — Core service clusters with any qualified visibility (3 pts)

*Breadth matters: a business can rank well for one service and be invisible for the rest of what it sells.* · high · deterministic

| Score | Anchor |
|---:|---|
| 3 | At least 80% of core service clusters have a top-20 Maps/Pack or organic result, or an AI mention, somewhere in the market. |
| 2 | 50–79% of core service clusters have qualified visibility. |
| 1 | 25–49% of core service clusters have qualified visibility. |
| 0 | Fewer than 25% of core service clusters have qualified visibility. |

**Capture:** Core service clusters from the locked query universe and any qualified top-20 or AI-mention observation.

**If weak:** Prioritize the service clusters with no qualified visibility. Confirm the business actually sells them before treating the gap as a defect.

### LV-INT-02 — Demand-weighted non-branded coverage (3 pts)

*The score should reflect how much commercially meaningful demand is covered, not how many keywords were collected.* · critical · deterministic

| Score | Anchor |
|---:|---|
| 3 | Demand-weighted coverage is at least 75% of the core non-branded intent weight. |
| 2 | Demand-weighted coverage is 50–74%. |
| 1 | Demand-weighted coverage is 25–49%. |
| 0 | Demand-weighted coverage is below 25%. |

**Capture:** Demand-weighted share of core non-branded intents with any qualified visibility. Service clusters are equally weighted; within a cluster, no single intent may exceed 50% of the cluster weight.

**If weak:** Rebuild the content and entity strategy around the uncovered demand, starting with the highest-weight clusters. Do not optimize a head term at the expense of every other service.

### LV-INT-03 — High-commercial-intent coverage (2 pts)

*Commercial intent is where visibility is most likely to matter to the business.* · high · deterministic

| Score | Anchor |
|---:|---|
| 2 | At least 70% of high-commercial intents have a top-10 result or AI mention on at least one core surface. |
| 1 | 35–69% of high-commercial intents have that visibility. |
| 0 | Fewer than 35% of high-commercial intents have that visibility. |

**Capture:** Share of intents classified commercial or transactional with a qualified top-10 or AI mention.

**If weak:** Focus the next content and profile work on the commercial intents that are absent.

### LV-INT-04 — Emergency or urgent intent coverage (2 pts)

*Urgent demand is often the highest-intent, highest-value demand a trade sells.* · high · deterministic · only if `emergency_service`

| Score | Anchor |
|---:|---|
| 2 | At least 70% of emergency intents have a top-10 result or AI mention on at least one core surface. |
| 1 | 30–69% of emergency intents have that visibility. |
| 0 | Fewer than 30% of emergency intents have that visibility. |

**Capture:** Share of emergency and urgent intents with qualified visibility. Only scored when configuration.emergency_service is true.

**If weak:** Treat emergency visibility as a service-line decision: either build a credible urgent path or state that the business does not offer one.

### LV-INT-05 — Service + city intent coverage (2 pts)

*Service + city queries are how many local customers express intent.* · high · deterministic · only if `city_modified_demand`

| Score | Anchor |
|---:|---|
| 2 | At least 70% of service + city intents have a top-20 Maps/Pack or organic result. |
| 1 | 30–69% of service + city intents have that visibility. |
| 0 | Fewer than 30% of service + city intents have that visibility. |

**Capture:** Share of city-modified service intents with qualified visibility. Only scored when configuration.city_modified_demand is true.

**If weak:** Create or improve the location-specific service pages and confirm the market is actually served.

### LV-INT-06 — Near-me intent coverage (1 pts)

*Near-me queries are the closest thing to a customer standing in the market and asking who is nearby.* · medium · deterministic · only if `near_me_demand`

| Score | Anchor |
|---:|---|
| 1 | At least 50% of near-me intents have a top-10 Maps/Pack or organic result. |
| 0 | Fewer than 50% of near-me intents have that visibility. |

**Capture:** Share of near-me intents with qualified visibility. Only scored when configuration.near_me_demand is true.

**If weak:** Check proximity, service-area configuration, and the strength of the local entity footprint before adding pages.

### LV-INT-07 — Problem and symptom intent coverage (2 pts)

*Problem-led searches are how customers describe the job before they know the service name.* · medium · deterministic

| Score | Anchor |
|---:|---|
| 2 | At least 60% of problem/symptom intents have a top-20 organic result or AI mention. |
| 1 | 25–59% of problem/symptom intents have that visibility. |
| 0 | Fewer than 25% of problem/symptom intents have that visibility. |

**Capture:** Share of problem and symptom intents with qualified visibility.

**If weak:** Map content to the symptoms the business actually solves. Do not publish generic DIY content that cannot produce a service lead.

**Also ask the owner (not scored):**

- Search Console clicks by query cluster (OD-LV-GSC-CLICKS)
- Search Console CTR and average position (OD-LV-GSC-CTR)
- Priority services by gross profit (OD-LV-PRIORITY-SERVICES)

## 2. Discover

*Does the business appear in Maps, the Local Pack, and ordinary organic results throughout the market?*

### LV-MAP-01 — Demand-weighted Local Pack Top-3 coverage (3 pts)

*The Local Pack is the most concentrated local-discovery surface. Top-3 presence is the practical visibility outcome.* · critical · deterministic

| Score | Anchor |
|---:|---|
| 3 | Demand-weighted Top-3 coverage in the Local Pack is at least 50%. |
| 2 | Demand-weighted Top-3 coverage is 25–49%. |
| 1 | Demand-weighted Top-3 coverage is 10–24%. |
| 0 | Demand-weighted Top-3 coverage is below 10%. |

**Capture:** Best Local Pack rank per core query across the grid; demand-weighted.

**If weak:** Investigate relevance, proximity, authority, service-area competition, and profile configuration. Cross-reference GBP Scorecard for profile diagnosis.

### LV-MAP-02 — Local Pack Top-10 coverage (3 pts)

*Top-10 presence shows whether the business is a realistic option beyond a single lucky location.* · high · deterministic

| Score | Anchor |
|---:|---|
| 3 | At least 70% of core Local Pack observations place the business in the top 10. |
| 2 | 45–69% place it in the top 10. |
| 1 | 20–44% place it in the top 10. |
| 0 | Fewer than 20% place it in the top 10. |

**Capture:** Share of core Local Pack query-grid observations with a top-10 target rank.

**If weak:** Look for the service and geographic clusters where the business disappears, not just the market average.

### LV-MAP-03 — Local Pack Top-20 coverage (2 pts)

*A business absent from the top 20 is not a realistic local option on that surface.* · medium · deterministic

| Score | Anchor |
|---:|---|
| 2 | At least 80% of core Local Pack observations place the business in the top 20. |
| 1 | 50–79% place it in the top 20. |
| 0 | Fewer than 50% place it in the top 20. |

**Capture:** Share of core Local Pack query-grid observations with a top-20 target rank.

**If weak:** Prioritize complete absence over rank improvement. A missing entity is a different problem from a weak rank.

### LV-MAP-04 — Average visible Local Pack position (2 pts)

*Average position adds texture that top-N coverage alone hides.* · medium · deterministic

| Score | Anchor |
|---:|---|
| 2 | The demand-weighted average visible Local Pack position is 3.0 or better. |
| 1 | The average visible position is between 3.1 and 7.0. |
| 0 | The average visible position is worse than 7.0, or the business is not visible. |

**Capture:** Demand-weighted average of the best Local Pack rank per core query. Missing observations are excluded from the average and counted by coverage checks.

**If weak:** Use this as context, not as the primary score. Coverage and geographic consistency are more robust.

### LV-MAP-05 — Google Maps Top-3 coverage (3 pts)

*Maps is a distinct surface from the Local Pack. Its ordering can differ and must not be silently merged.* · critical · deterministic

| Score | Anchor |
|---:|---|
| 3 | At least 50% of core Maps observations place the business in the top 3. |
| 2 | 25–49% place it in the top 3. |
| 1 | 10–24% place it in the top 3. |
| 0 | Fewer than 10% place it in the top 3. |

**Capture:** Share of core Google Maps query-grid observations with a top-3 target rank.

**If weak:** Diagnose Maps separately. Check proximity, category relevance, and geographic coverage before assuming a content problem.

### LV-MAP-06 — Google Maps Top-10 coverage (2 pts)

*Top-10 Maps visibility is the threshold where a business is a plausible choice across the market.* · high · deterministic

| Score | Anchor |
|---:|---|
| 2 | At least 70% of core Maps observations place the business in the top 10. |
| 1 | 40–69% place it in the top 10. |
| 0 | Fewer than 40% place it in the top 10. |

**Capture:** Share of core Google Maps query-grid observations with a top-10 target rank.

**If weak:** Compare Maps and Local Pack results. A gap between them is diagnostic, not noise.

### LV-MAP-07 — Geo-grid consistency (3 pts)

*A single strong pin can hide a market-wide visibility gap. The grid measures consistency.* · high · deterministic

| Score | Anchor |
|---:|---|
| 3 | At least 60% of grid points have a top-10 Maps result for at least one core Maps intent. |
| 2 | 35–59% of grid points are covered. |
| 1 | 15–34% of grid points are covered. |
| 0 | Fewer than 15% of grid points are covered. |

**Capture:** Share of configured grid points with a top-10 target result, demand-weighted across core Maps intents.

**If weak:** Use the grid and quadrant summary to find the areas where the business disappears. Do not average the gap away.

### LV-MAP-08 — Service-specific Maps coverage (3 pts)

*A business can dominate one service in Maps and be absent from the services it wants to grow.* · high · deterministic

| Score | Anchor |
|---:|---|
| 3 | At least 75% of core service clusters have 40% or better top-10 Maps coverage. |
| 2 | 50–74% of clusters meet that threshold. |
| 1 | 25–49% of clusters meet it. |
| 0 | Fewer than 25% of clusters meet it. |

**Capture:** Share of core service clusters whose Maps top-10 coverage is at least 40%.

**If weak:** Separate the strong service from the weak service in the report. The fix is usually service-specific, not market-wide.

### LV-MAP-09 — Geographic gap severity (2 pts)

*The weakest area is the clearest evidence of a geographic visibility gap.* · medium · deterministic

| Score | Anchor |
|---:|---|
| 2 | The weakest grid quadrant still has at least 40% top-10 Maps coverage. |
| 1 | The weakest quadrant has 15–39% coverage. |
| 0 | The weakest quadrant has less than 15% coverage. |

**Capture:** Top-10 Maps coverage in the weakest of the four grid quadrants.

**If weak:** Check whether the weak quadrant is actually served. If it is, investigate proximity and location-page coverage.

### LV-MAP-10 — Local Finder coverage (2 pts)

*Local Finder can reveal a different ordering from the Local Pack and Maps.* · medium · deterministic · only if `local_finder_configured`

| Score | Anchor |
|---:|---|
| 2 | At least 60% of configured Local Finder observations place the business in the top 10. |
| 1 | 30–59% place it in the top 10. |
| 0 | Fewer than 30% place it in the top 10. |

**Capture:** Share of configured Local Finder observations with a top-10 target rank. Only scored when configuration.local_finder_configured is true.

**If weak:** Treat Local Finder as a separate observation. Do not merge it into the Maps rank.

### LV-ORG-01 — Demand-weighted organic Top-3 coverage (3 pts)

*Organic Top-3 visibility is rare and valuable for local commercial queries.* · high · deterministic

| Score | Anchor |
|---:|---|
| 3 | Demand-weighted organic Top-3 coverage is at least 35%. |
| 2 | Demand-weighted Top-3 coverage is 15–34%. |
| 1 | Demand-weighted Top-3 coverage is 5–14%. |
| 0 | Demand-weighted Top-3 coverage is below 5%. |

**Capture:** Best organic rank per core query, demand-weighted.

**If weak:** Investigate the pages that rank, the intent match, and the authority gap. Cross-reference Website Scorecard for page quality.

### LV-ORG-02 — Organic Top-10 coverage (3 pts)

*Top-10 organic presence is the practical threshold for non-branded discovery.* · high · deterministic

| Score | Anchor |
|---:|---|
| 3 | At least 60% of core organic observations place the business in the top 10. |
| 2 | 35–59% place it in the top 10. |
| 1 | 15–34% place it in the top 10. |
| 0 | Fewer than 15% place it in the top 10. |

**Capture:** Share of core organic queries with a top-10 target rank.

**If weak:** Focus on the service clusters with no top-10 presence. Confirm a relevant page exists before recommending content.

### LV-ORG-03 — Organic Top-20 coverage (2 pts)

*A business absent from the top 20 is not a realistic organic option for that intent.* · medium · deterministic

| Score | Anchor |
|---:|---|
| 2 | At least 75% of core organic observations place the business in the top 20. |
| 1 | 45–74% place it in the top 20. |
| 0 | Fewer than 45% place it in the top 20. |

**Capture:** Share of core organic queries with a top-20 target rank.

**If weak:** Prioritize complete absence over marginal rank movement.

### LV-ORG-04 — Demand-weighted ranking coverage (2 pts)

*Rank credit captures partial visibility that top-N coverage alone does not.* · medium · deterministic

| Score | Anchor |
|---:|---|
| 2 | The demand-weighted rank credit is at least 0.60. |
| 1 | Rank credit is 0.30–0.59. |
| 0 | Rank credit is below 0.30. |

**Capture:** Rank credit: 1.0 for top 3, 0.7 for 4–10, 0.3 for 11–20, 0 outside the top 20; demand-weighted across core organic queries.

**If weak:** Use coverage bands for the primary diagnosis and rank credit as supporting context.

### LV-ORG-05 — Ranking URL relevance to intent (2 pts)

*A ranking for the wrong page can look like visibility while failing the customer.* · high · model_judgment

| Score | Anchor |
|---:|---|
| 2 | Every observed ranking URL is a dedicated page that matches the service and intent. |
| 1 | Some rankings use a generic home page or a page that only partially matches the intent. |
| 0 | Rankings are dominated by unrelated pages or a page that does not represent the service. |

**Capture:** The ranking URL, its path or title, and the tracked intent. The reviewer judges relevance; the scorecard does not audit the page itself.

**If weak:** Map each commercial intent to a page that genuinely serves it. Do not score page speed, forms, or UX here; those belong to Website Scorecard.

### LV-ORG-06 — City-modified organic coverage (2 pts)

*City-modified queries show whether the business is visible in the places it claims to serve.* · medium · deterministic · only if `city_modified_demand`

| Score | Anchor |
|---:|---|
| 2 | At least 70% of city-modified organic queries have a top-20 target rank. |
| 1 | 30–69% have that visibility. |
| 0 | Fewer than 30% have that visibility. |

**Capture:** Share of city-modified organic queries with a top-20 target. Only scored when configuration.city_modified_demand is true.

**If weak:** Check location-page coverage and the market configuration before adding pages.

### LV-ORG-07 — Service-cluster organic coverage (1 pts)

*Portfolio coverage prevents one strong service from hiding an organic gap in the rest of the business.* · medium · deterministic

| Score | Anchor |
|---:|---|
| 1 | At least 60% of core service clusters have 30% or better top-10 organic coverage. |
| 0 | Fewer than 60% of service clusters meet that threshold. |

**Capture:** Share of core service clusters with at least 30% top-10 organic coverage.

**If weak:** Use the cluster view to decide whether the organic gap is service-specific or market-wide.

## 3. Ask

*When a customer asks an AI system for a recommendation, is the business mentioned, recommended, and cited?*

### LV-AI-01 — AI mention coverage (3 pts)

*Mention is the first threshold of AI visibility. It is not the same as a recommendation.* · critical · deterministic

| Score | Anchor |
|---:|---|
| 3 | The target is mentioned in at least 60% of validated prompt-platform pairs (majority of repeats). |
| 2 | The target is mentioned in 35–59% of pairs. |
| 1 | The target is mentioned in 15–34% of pairs. |
| 0 | The target is mentioned in fewer than 15% of pairs. |

**Capture:** Share of validated prompt-platform pairs where the target is mentioned in at least half of repeats.

**If weak:** Analyze the prompt intents and surfaces where the business is absent. Distinguish mention from recommendation before prescribing a fix.

### LV-AI-02 — AI recommendation coverage (3 pts)

*A mention inside a directory list is not the same as a recommendation.* · critical · deterministic

| Score | Anchor |
|---:|---|
| 3 | The target is recommended in at least 40% of validated prompt-platform pairs. |
| 2 | The target is recommended in 20–39% of pairs. |
| 1 | The target is recommended in 5–19% of pairs. |
| 0 | The target is recommended in fewer than 5% of pairs. |

**Capture:** Share of validated prompt-platform pairs where the target is recommended, not merely mentioned, in at least half of repeats.

**If weak:** Analyze the citation and corroboration ecosystem, not just content. A recommendation usually depends on third-party evidence.

### LV-AI-03 — AI citation and source coverage (3 pts)

*Being named is weaker than being the cited source. The distinction predicts durable AI visibility.* · high · deterministic

| Score | Anchor |
|---:|---|
| 3 | The target's domain or entity is cited in at least 35% of validated prompt-platform pairs. |
| 2 | The target is cited in 15–34% of pairs. |
| 1 | The target is cited in 5–14% of pairs. |
| 0 | The target is cited in fewer than 5% of pairs. |

**Capture:** Share of validated prompt-platform pairs where the target's domain or entity is cited as a source, in at least half of repeats.

**If weak:** Build citable, source-worthy content and third-party corroboration. Do not claim a citation you cannot observe.

### LV-AI-04 — Service relevance in AI answers (2 pts)

*AI answers can mention a business for the wrong service, which can create misleading visibility.* · high · model_judgment

| Score | Anchor |
|---:|---|
| 2 | Every observed mention or recommendation is for the relevant service and the customer's stated problem. |
| 1 | Some mentions are generic, adjacent-service, or only loosely relevant. |
| 0 | Mentions are off-service or do not address the customer's problem. |

**Capture:** The AI answer text, the prompt intent, and the configured service cluster.

**If weak:** If relevance is weak, investigate entity ambiguity and content-to-intent mismatch. Do not treat the mention as a win.

### LV-AI-05 — Location relevance in AI answers (2 pts)

*A recommendation for a business outside the customer's market is not local visibility.* · high · model_judgment

| Score | Anchor |
|---:|---|
| 2 | Every mention or recommendation places the business in the target market. |
| 1 | Some mentions are ambiguous, broader than the market, or only partially local. |
| 0 | Mentions are for another market or do not establish local relevance. |

**Capture:** The AI answer text, the configured market, and the observed location context.

**If weak:** Clarify the service area and entity location. Cross-reference GBP Scorecard for location configuration.

### LV-AI-06 — Entity accuracy in AI answers (1 pts)

*An AI answer that confuses the business with another entity can harm trust and send the wrong customer.* · medium · model_judgment

| Score | Anchor |
|---:|---|
| 1 | Name, domain, phone, and service identity are accurate wherever observed. |
| 0 | A material identity error appears in an AI answer. |

**Capture:** The AI answer text and the resolved business identity.

**If weak:** Correct the underlying entity footprint and cross-reference GBP Scorecard identity checks. Do not edit an AI answer directly.

### LV-AI-07 — Competitive share of AI answers (2 pts)

*Share of answer is more informative than an isolated mention.* · medium · deterministic

| Score | Anchor |
|---:|---|
| 2 | The target earns at least 25% of business-competitor recommendations in validated AI answers. |
| 1 | The target earns 10–24%. |
| 0 | The target earns less than 10%. |

**Capture:** Target recommendations divided by target plus locked business-competitor recommendations, demand-weighted. Directories and publishers are excluded from the competitor denominator.

**If weak:** Compare the sources AI systems cite for the competitors. The gap is usually corroboration, not prompt wording.

### LV-AI-08 — Prompt-intent coverage (2 pts)

*AI visibility should be measured across the demand model, not one convenient prompt.* · high · deterministic

| Score | Anchor |
|---:|---|
| 2 | At least 60% of canonical prompt intents have a mention or recommendation on at least one validated surface. |
| 1 | 30–59% of prompt intents have that visibility. |
| 0 | Fewer than 30% of prompt intents have that visibility. |

**Capture:** Share of canonical prompt intents with at least one mention or recommendation across validated surfaces.

**If weak:** Expand prompt coverage and investigate the intents where the business never appears.

### LV-AI-09 — AI repeat stability (1 pts)

*AI answers vary. A score that hides the variance is less trustworthy than one that reports it.* · medium · deterministic

| Score | Anchor |
|---:|---|
| 1 | At least 80% of prompt-platform pairs have consistent mention status across all repeats. |
| 0 | Fewer than 80% of pairs are consistent. |

**Capture:** Share of prompt-platform pairs where every repeat agrees on whether the target was mentioned.

**If weak:** Increase repeats before drawing a conclusion. Report unstable prompts separately.

### LV-AI-10 — Validated AI surface breadth (1 pts)

*A single AI surface is a fragile visibility source.* · medium · deterministic

| Score | Anchor |
|---:|---|
| 1 | The target is mentioned on at least 50% of validated AI surfaces with observations. |
| 0 | The target is mentioned on fewer than 50% of validated surfaces. |

**Capture:** Share of validated AI surfaces where the target appears at least once. Surfaces are never pooled across source_type.

**If weak:** Distinguish consumer/search surfaces from model/API surfaces in the report. Do not treat them as equivalent.

**Also ask the owner (not scored):**

- AI referral traffic (OD-LV-AI-REFERRALS)
- AI-origin leads and jobs (OD-LV-AI-LEADS)

## 4. Compare

*How does the business's share of discovery compare with real local competitors and credible external sources?*

### LV-CMP-01 — Business-competitor share of Top-3 (2 pts)

*Share of visibility relative to real local competitors is more meaningful than an absolute rank.* · high · deterministic

| Score | Anchor |
|---:|---|
| 2 | The target earns at least 25% of business-competitor Top-3 appearances across core Maps/Pack/organic observations. |
| 1 | The target earns 10–24%. |
| 0 | The target earns less than 10%. |

**Capture:** Target Top-3 appearances divided by target plus locked business-competitor Top-3 appearances.

**If weak:** Identify the competitors winning the appearances and the surfaces where they win. Do not count directories as contractors.

### LV-CMP-02 — Business-competitor share of Top-10 (2 pts)

*Top-10 share shows whether the business is a consistent option, not a one-query exception.* · high · deterministic

| Score | Anchor |
|---:|---|
| 2 | The target earns at least 25% of business-competitor Top-10 appearances. |
| 1 | The target earns 10–24%. |
| 0 | The target earns less than 10%. |

**Capture:** Target Top-10 appearances divided by target plus locked business-competitor Top-10 appearances.

**If weak:** Compare service by service. A market-wide average can hide a single-service collapse.

### LV-CMP-03 — Maps share of visibility (1 pts)

*Maps share isolates the local surface from organic and AI.* · medium · deterministic

| Score | Anchor |
|---:|---|
| 1 | The target earns at least 25% of business-competitor Maps appearances. |
| 0 | The target earns less than 25%. |

**Capture:** Target Maps appearances divided by target plus business-competitor Maps appearances.

**If weak:** If Maps share is weak, investigate proximity and local relevance before content.

### LV-CMP-04 — Organic share of visibility (1 pts)

*Organic share isolates search-result visibility from Maps and AI.* · medium · deterministic

| Score | Anchor |
|---:|---|
| 1 | The target earns at least 20% of business-competitor organic appearances. |
| 0 | The target earns less than 20%. |

**Capture:** Target organic appearances divided by target plus business-competitor organic appearances.

**If weak:** If organic share is weak, investigate page-to-intent coverage and authority.

### LV-CMP-05 — AI recommendation share (1 pts)

*AI share shows whether recommendation behavior is concentrated or shared.* · medium · deterministic

| Score | Anchor |
|---:|---|
| 1 | The target earns at least 20% of business-competitor recommendations in validated AI answers. |
| 0 | The target earns less than 20%. |

**Capture:** Target AI recommendations divided by target plus business-competitor recommendations.

**If weak:** Compare the cited sources. AI recommendations often follow corroboration, not direct optimization.

### LV-CMP-06 — Service-specific competitor gap (2 pts)

*Aggregate share can hide a service where the business is structurally behind.* · high · deterministic

| Score | Anchor |
|---:|---|
| 2 | The target meets or beats the cohort median top-10 share in at least 75% of core service clusters. |
| 1 | The target meets the median in 40–74% of clusters. |
| 0 | The target meets the median in fewer than 40% of clusters. |

**Capture:** Per-service comparison against the locked business-competitor cohort median.

**If weak:** Prioritize the clusters where the gap is largest and the service matters commercially.

### LV-CMP-07 — Geographic competitor gap (1 pts)

*A competitor can dominate one part of the market while the market average looks acceptable.* · medium · deterministic

| Score | Anchor |
|---:|---|
| 1 | The target meets or beats the cohort median top-10 Maps coverage in at least half of the grid quadrants. |
| 0 | The target meets the median in fewer than half of the quadrants. |

**Capture:** Per-quadrant target coverage compared with the locked cohort median.

**If weak:** Use the quadrant comparison to decide whether the gap is geographic or service-specific.

### LV-AUT-01 — Relevant referring domains (2 pts)

*Relevant corroboration matters more than raw link quantity.* · high · deterministic

| Score | Anchor |
|---:|---|
| 2 | At least 8 relevant referring domains (local, industry, manufacturer, trade, or association). |
| 1 | 3–7 relevant referring domains. |
| 0 | Fewer than 3 relevant referring domains. |

**Capture:** Count of referring domains classified as locally or industrially relevant. Generic low-value directories are excluded.

**If weak:** Pursue a small number of genuinely relevant local, manufacturer, trade, or association sources. Do not buy generic directory links.

### LV-AUT-02 — Local source relevance (2 pts)

*A local business needs local corroboration, not just links from anywhere.* · high · model_judgment

| Score | Anchor |
|---:|---|
| 2 | Multiple current local sources corroborate the business as a local operator. |
| 1 | One meaningful local source, or several low-relevance local directories, corroborate it. |
| 0 | No meaningful local corroboration is observable. |

**Capture:** The referring domains, listing sources, and their local relevance. The reviewer classifies source relevance.

**If weak:** Build relationships with local organizations, publications, and trade sources. Do not treat a generic directory as local proof.

### LV-AUT-03 — Industry, manufacturer, and trade sources (2 pts)

*Trade-specific corroboration supports both search and AI recommendation.* · medium · deterministic

| Score | Anchor |
|---:|---|
| 2 | At least 4 industry, manufacturer, dealer, trade-association, or trade-publication sources. |
| 1 | 1–3 such sources. |
| 0 | No such sources are observed. |

**Capture:** Count of industry and trade sources in the referring-domain and listing observations.

**If weak:** Pursue manufacturer/dealer listings, trade associations, and credible trade publications where the business qualifies.

### LV-AUT-04 — External listing and entity consistency (2 pts)

*Inconsistent entity data weakens both local search and AI entity resolution.* · high · deterministic

| Score | Anchor |
|---:|---|
| 2 | At least 80% of observed external listings agree on name, domain, phone, and service category. |
| 1 | 50–79% agree. |
| 0 | Fewer than 50% agree. |

**Capture:** Share of observed listings with consistent name, domain, phone, and service category.

**If weak:** Correct the highest-authority inconsistent listings first. Cross-reference GBP Scorecard for the primary profile.

### LV-AUT-05 — Competitor authority gap (1 pts)

*Authority is relative. A number without a local comparison is not actionable.* · medium · deterministic

| Score | Anchor |
|---:|---|
| 1 | Relevant referring domains meet or exceed the locked cohort median. |
| 0 | Relevant referring domains are below the cohort median. |

**Capture:** Target relevant referring domains compared with the locked business-competitor cohort median.

**If weak:** Compare the sources the leading competitors have that the business does not. Prioritize relevance over volume.

### LV-AUT-06 — Authority overlap with AI citations (1 pts)

*AI answers cite sources. If the business is absent from the sources the market relies on, recommendation visibility is fragile.* · medium · deterministic

| Score | Anchor |
|---:|---|
| 1 | At least 25% of the target's relevant authority domains also appear as citation domains in the observed AI answer ecosystem. |
| 0 | Fewer than 25% overlap. |

**Capture:** Overlap between relevant referring domains and the domains cited in validated AI observations.

**If weak:** Prioritize sources that both corroborate the entity and appear in AI citations.

**Also ask the owner (not scored):**

- Qualified leads from non-branded organic search (OD-LV-ORGANIC-LEADS)
- Revenue from organic discovery (OD-LV-ORGANIC-REVENUE)

## 5. Resilience

*Would the business still be discoverable if one surface, service, or area weakened?*

### LV-RES-01 — Surface concentration (1 pts)

*A business that depends on one surface is fragile even when that surface is strong.* · medium · deterministic

| Score | Anchor |
|---:|---|
| 1 | The Herfindahl index of visibility appearances across Maps/Pack, organic, and AI is 0.55 or lower. |
| 0 | The Herfindahl index is above 0.55. |

**Capture:** Surface HHI computed from target appearances across core surfaces. Lower values indicate more diversified discovery.

**If weak:** Do not weaken a strong surface. Build a second surface as insurance and report the concentration explicitly.

### LV-RES-02 — Service concentration (1 pts)

*One-service visibility is a business risk, not only an SEO risk.* · medium · deterministic

| Score | Anchor |
|---:|---|
| 1 | The Herfindahl index of visibility across core service clusters is 0.50 or lower. |
| 0 | The Herfindahl index is above 0.50. |

**Capture:** Service HHI computed from demand-weighted target visibility across service clusters.

**If weak:** Decide whether the concentration is intentional. If not, build visibility for the next most important service.

### LV-RES-03 — Geographic concentration (1 pts)

*A business visible in one corner of its market may not be visible across the market it claims.* · medium · deterministic

| Score | Anchor |
|---:|---|
| 1 | The Herfindahl index of top-10 Maps coverage across the four grid quadrants is 0.50 or lower. |
| 0 | The Herfindahl index is above 0.50. |

**Capture:** Geographic HHI computed from top-10 coverage across the four grid quadrants.

**If weak:** Check whether the concentration matches the service area. If not, investigate proximity and location coverage.

### LV-RES-04 — Branded versus non-branded dependence (1 pts)

*Strong branded visibility can mask weak non-branded discovery.* · medium · deterministic · only if `branded_diagnostics_enabled`

| Score | Anchor |
|---:|---|
| 1 | Branded appearances are 20% or less of total observed search appearances. |
| 0 | Branded appearances are more than 20% of total appearances. |

**Capture:** Share of branded visibility among all observed search appearances. Branded queries are diagnostic and never inflate the core score. Only scored when configuration.branded_diagnostics_enabled is true.

**If weak:** Separate branded from non-branded demand in every report. Do not let branded rank inflate the core score.

### LV-RES-05 — Reproducible visibility trend (1 pts)

*A trend is useful only when the comparison is reproducible.* · low · deterministic · only if `historical_runs_available`

| Score | Anchor |
|---:|---|
| 1 | The current demand-weighted visibility index is within 10% of the prior comparable run, or has improved. |
| 0 | The visibility index has declined by more than 10% against a comparable prior run. |

**Capture:** Demand-weighted visibility index compared with a prior run that used a comparable query universe and grid. Only scored when configuration.historical_runs_available is true and a comparable run is supplied.

**If weak:** Investigate lost visibility by surface and service. Do not invent a trend when the prior run is not comparable.

**Also ask the owner (not scored):**

- Revenue concentration by service and area (OD-LV-LOCAL-SEARCH-REVENUE)

## 6. Handoff

*When the customer chooses the business, do the Google Business Profile and owned website create trust and convert?*

This stage is diagnosed by a sibling scorecard, not by Local Visibility:

- GBP Scorecard: profile identity, services, reviews, conversion actions, and handoff.
- Website Scorecard: page speed, mobile UX, forms, CTA usability, booking flow, and measurement.

Do not score those surfaces here. Record the observed ranking URL and the handoff context only.

## 7. Measure

*Can discovery-origin demand be tied to qualified leads, jobs, and revenue?*

This stage is not scored from public data. Ask the owner:

- **Paid discovery return** (OD-LV-PAID-ROI)
  - What is the cost per qualified lead for Search Ads and Local Services Ads?
  - Does paid search cover demand the business cannot earn organically?

## Validity gates

A run is not scoreable until every gate passes. If a gate fails, report **INSUFFICIENT EVIDENCE** and show the failed gate. Never convert a provider outage into a low business score.

| Gate | Threshold |
|---|---|
| Artifact schema is valid | The audit validates against the V1 schema and its schema_version is known. |
| Target business resolved | business.resolution.resolved is true and match confidence is at least 0.80. |
| Query universe locked | query_universe.locked is true, a hash is present, and the hash matches the universe content. |
| Market configuration matches the universe | Trade, market name, language, and device match between the audit and the query universe. |
| Core query coverage | At least 80% of planned core queries are observed on each required core surface. |
| Geo-grid coverage | At least 80% of planned grid points are observed for each configured Maps surface. |
| Validated AI surface available | At least one validated AI surface has observations. |
| AI repeat completeness | At least 80% of planned prompt-platform-repeat observations are present. |
| Competitor cohort locked | competitors.locked is true and at least two business competitors are in the locked cohort. |
| Authority data present | At least one referring-domain or external listing observation is present. |
| Provider error rate | The recorded provider error rate is at most 0.10. |
| No critical source outage | No required core source is recorded as a critical outage. |

## Owner-data questions

| ID | Stage | Question | Why it matters |
|---|---|---|---|
| OD-LV-GSC-CLICKS | search | Search Console clicks by query cluster | Public SERP observation shows where the business appears; Search Console shows whether those impressions produced clicks. |
| OD-LV-GSC-CTR | search | Search Console CTR and average position | A ranking can be visible and still be ignored. CTR and position separate a ranking problem from a result-quality problem. |
| OD-LV-PRIORITY-SERVICES | search | Priority services by gross profit | The audit measures visibility across the configured services. The owner knows which services deserve disproportionate attention. |
| OD-LV-ORGANIC-LEADS | compare | Qualified leads from non-branded organic search | Visibility is not the same as qualified demand. Only the owner can show whether an organic visit became a real lead. |
| OD-LV-ORGANIC-REVENUE | compare | Revenue from organic discovery | A visibility gap matters more when the affected service produces meaningful revenue. |
| OD-LV-AI-REFERRALS | ask | AI referral traffic | A mention in an AI answer may or may not produce a visit. Referral data is the only public-adjacent way to see the handoff. |
| OD-LV-AI-LEADS | ask | AI-origin leads and jobs | Being recommended by an AI system is not proof that the recommendation becomes a customer. |
| OD-LV-LOCAL-SEARCH-REVENUE | resilience | Revenue concentration by service and area | A diversified visibility profile only matters if the underlying revenue is also diversified. |
| OD-LV-PAID-ROI | measure | Paid discovery return | Paid search and Local Services Ads are optional discovery channels. Their absence never lowers the public score. |

## Opportunity flags

These are never scored. Recommend them separately if the evidence supports them.

| Flag | Service mapping | Why |
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
