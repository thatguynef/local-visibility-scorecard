# Style guide

Local Visibility Scorecard is part of a scorecard family. It should look and read like Website Scorecard and GBP Scorecard while making its own diagnosis.

## Voice

- Direct, calm, evidence-based.
- Prefer "observed" and "not observed" over absolute claims.
- Say "may create discovery friction," not "is losing jobs."
- Say "owner data required," not "unknown, so probably bad."
- Use short sentences when the finding is serious.
- Do not use hype.

Avoid:

- guaranteed revenue lift;
- this is definitely losing jobs;
- best-in-class;
- revolutionary;
- AI-powered growth engine;
- GEO magic;
- "rank #1" as a promise;
- arbitrary SEO best-practice language.

## Structure

- Lead with the finding, then the evidence, then why it matters, then the fix.
- Label every finding with an evidence state.
- Separate **Visibility Gaps**, **Revenue Opportunities to Investigate**, and **Limitations**.
- Keep the one-pager under 1,150 words.
- Put the full check inventory in the full report, not the one-pager.

## Headings

- Sentence case.
- `## The three biggest visibility gaps`
- `## Visibility snapshot`
- `## Signature visibility matrix`
- `## Score breakdown`
- `## Revenue Opportunities to Investigate`
- `## Limitations`

## Tables

- Renderer-owned. Do not hand-edit report tables.
- Use canonical check IDs.
- Show N/A as `N/A`, not `0`.
- Show confidence labels in uppercase: `VERIFIED`, `STRONG SIGNAL`, `OWNER DATA REQUIRED`, `NOT APPLICABLE`.
- Separate consumer/search AI surfaces from model/API surfaces.

## Code and config

- Use fenced code blocks with a language.
- Use `example.com`, `*.example`, and `555-01xx` placeholders.
- Do not put real credentials, client names, customer data, geo-grid coordinates, or production IDs in examples.
- Do not put a credential-looking value in `.env.example`.

## Visual system

| Token | Value |
|---|---|
| Ink | `#0B0B0C` |
| Surface | `#141416` |
| Card | `#1C1C1F` |
| Paper | `#F7F7F5` |
| Muted | `#A6A6AA` |
| Brand Red | `#FF3B3B` |
| Soft Red | `#FF8F8F` |
| Green | `#3FBF7F` |
| Amber | `#F5C766` |

The site shares the Website and GBP Scorecard tokens and typography. Do not fork the visual language.

## Images

- Every image needs alt text.
- SVG files need a `<title>`.
- Do not use real client screenshots.
- Prefer generated synthetic diagrams over photos.
- Keep assets under budget.

## Checklists

- Use task lists for release/publication checks.
- Do not use them as a substitute for tests.

## Links

- Relative links inside docs.
- Absolute GitHub links for contributor-facing files.
- Cite the canonical source when describing a check or score.

## Claims

A Local Visibility report may say:

> The business appears in the Local Pack for 42% of tracked grid observations.

It may not say:

> The business is losing 58% of its potential customers.

The first is an observable visibility outcome. The second is a revenue claim the public evidence cannot support.
