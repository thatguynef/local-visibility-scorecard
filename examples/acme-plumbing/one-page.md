# Local Visibility Scorecard — Acme Plumbing (synthetic)

> **Synthetic example — not a real business.**

**https://acme-plumbing.example/** · Plumbing · Example County, CA · **January 1, 2026**

# 60 / 100 — C (Average)

**Strong near the center for general plumbing and drain cleaning, but the business disappears for emergency demand, much of the Local Pack, and several service clusters where competitors are consistently visible. AI mentions are occasional and rarely cited.**

---

## The three biggest visibility gaps

### 1. Emergency demand is effectively invisible

**Stage:** Search
**Check:** LV-INT-04

**What is happening:** Only a small share of emergency query-grid observations place the business in the top 10, and no validated AI surface recommends it for emergency prompts.

**Evidence:** Emergency intent coverage is 16.3%; emergency AI recommendation coverage is 0%.

**Why it matters:** Urgent demand is the highest-intent demand a plumbing business sells. A customer with a burst pipe does not browse.

**Fix:** Decide whether emergency work is a real service line. If it is, build a dedicated urgent path and make the operational capacity visible; if it is not, stop presenting it as one.

**Confidence:** VERIFIED

---

### 2. The Local Pack is thin across the market

**Stage:** Discover
**Check:** LV-MAP-02

**What is happening:** Local Pack top-10 coverage is 42.2% of query-grid observations, and top-20 coverage is 51.0%. Coverage is strongest near the center and weak in the southwest quadrant.

**Evidence:** Local Pack Top-10 coverage 42.2%; Top-20 coverage 51.0%; weakest geo-grid quadrant 39.6%.

**Why it matters:** The Local Pack is the densest local-discovery surface. A business that appears only near its own pin is not consistently visible across the market it claims.

**Fix:** Investigate proximity, category and service relevance, and service-area competition. Cross-reference GBP Scorecard before treating this as a content problem.

**Confidence:** VERIFIED

---

### 3. Competitors win most service clusters

**Stage:** Compare
**Check:** LV-CMP-06

**What is happening:** The business meets or beats the locked competitor median top-10 share in only two of six service clusters. Emergency, sewer, and repiping are the largest gaps.

**Evidence:** Service-specific competitor gap: 2 of 6 clusters meet the cohort median (33.3%).

**Why it matters:** Aggregate visibility can hide a service where the business is structurally behind. Competitors are not winning everywhere; they are winning the clusters the business wants to grow.

**Fix:** Prioritize the two clusters with the largest commercial gap. Compare the sources and page coverage competitors have that the business does not.

**Confidence:** VERIFIED

---

## Visibility snapshot

| Surface | Observed signal | Reading |
|---|---|---|
| Local Pack | 42.2% top-10 | Partial |
| Google Maps | 45.0% top-10 | Partial |
| Organic search | 45.8% top-10 | Partial |
| AI answers | 41.5% mentioned | Partial |
| Business-competitor Top-10 share | 17.6% | Weak |

---

## Signature visibility matrix

| Service | Maps | Organic | AI | Opportunity |
|---|---|---|---|---|
| plumber | Strong | Strong | Strong | Maintain |
| emergency plumber | Weak | Partial | Absent | Critical |
| drain cleaning | Strong | Strong | Strong | Maintain |
| water heater repair | Strong | Strong | Partial | Improve |
| sewer repair | Absent | Absent | Absent | High |
| repiping | Absent | Absent | Absent | High |

---

## Score breakdown

| Area | Score |
|---|---|
| Intent & Demand Coverage | 8.0 / 15 |
| Maps & Local Pack Visibility | 14.1 / 25 |
| Organic Search Visibility | 8.0 / 15 |
| AI & Generative Visibility | 16.0 / 20 |
| Competitive Share of Visibility | 4.0 / 10 |
| Authority & Entity Footprint | 6.0 / 10 |
| Visibility Resilience | 3.8 / 5 |
| **Total** | **60 / 100** |

---

## What is already working

- General plumbing and drain cleaning have strong Maps and organic visibility near the market center.
- Branded search is strong, which confirms the business is known once a customer already knows its name.
- The external entity footprint includes relevant local, manufacturer, and trade sources, and most observed listings are consistent.

---

## Top fixes

| # | Fix | Checks | Points | Effort |
|---|---|---|---|---|
| 1 | Build or explicitly decline a dedicated emergency visibility path | LV-INT-04, LV-MAP-09 | +3 | M |
| 2 | Diagnose the Local Pack gap by service and quadrant before adding pages | LV-MAP-02, LV-MAP-03, LV-MAP-07 | +4 | M |
| 3 | Close the competitor gap in the two most commercially important service clusters | LV-CMP-06, LV-AUT-05, LV-AUT-06 | +3 | L |
| 4 | Build citable, source-worthy content and third-party corroboration for AI answers | LV-AI-03, LV-AI-08 | +2 | L |
| 5 | Diversify discovery beyond Maps | LV-RES-01 | +1 | M |

Points are bounded by the recoverable points in the cited checks. They are not a revenue forecast.

---

## Revenue Opportunities to Investigate

**OWNER DATA REQUIRED — not scored.**

**Search Console clicks by query cluster** (search) — Search Console shows whether the impressions behind these rankings produced clicks.
  - How many non-branded clicks did the tracked service and city query clusters receive in the last 90 days?
  - Which clusters receive impressions but almost no clicks?

**Search Console CTR and average position** (search) — A ranking can be visible and still be ignored. CTR and position separate a ranking problem from a result-quality problem.
  - What are the impressions, clicks, CTR, and average position for each core service cluster?
  - Does the business appear for the query but lose the click to a directory or a competitor?

---

## What to do next

1. Decide whether emergency work is a service line the business can actually deliver. If yes, build the urgent path; if no, stop implying it.
2. Use the GBP Scorecard to diagnose category, service, and location configuration before changing content for the Local Pack gap.
3. Prioritize the two service clusters with the largest commercial competitor gap and compare the sources competitors have.
4. Run the AI prompt set again with more repeats before treating a single recommendation or citation as durable.

---

## Limitations

- Public Mode observes discovery only. It cannot prove that a visibility gap produced a lost job or a revenue loss.
- AI answers vary between runs. The fixture records three repeats per prompt and uses a majority rule; a live audit should increase repeats before drawing a firm conclusion.
- Local Pack, Google Maps, and organic results are observed separately. Different surfaces can order the same businesses differently.

---

*Synthetic example for documentation. Not a real business. Public Mode · evidence first · owner data separate. · [Full audit](full-report.md) · Rubric v1.0.0 · Collector v1.0.0 · Scorer v1.0.0 · Universe sha256:f1e8f2e1817f87f64c6c07801b91315c0e51458eecf7496da8f060db92c93d6c · Run 2026-01-01T0000-acme*
