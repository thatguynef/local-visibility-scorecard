#!/usr/bin/env python3
"""Render references/portable-checklist.md from the canonical rubric.

The portable checklist is for a human or external browser agent collecting
public evidence without the repository's scripts. It never replaces the
scorer, the validity gates, or the evidence rules.

Usage:
  python3 render_portable.py
  python3 render_portable.py --check
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_RUBRIC = HERE.parent / "references" / "rubric.json"
DEFAULT_OUT = HERE.parent / "references" / "portable-checklist.md"
DOCS_OUT = HERE.parent.parent.parent.parent / "docs" / "portable-checklist.md"


def render(rubric: dict) -> str:
    lines = [
        "---",
        'description: "A portable, human-readable collection checklist for the 52 Local Visibility checks, evidence states, and validity gates."',
        "---",
        "",
        "# Portable Local Visibility Audit Checklist",
        "",
        "> **Generated from `rubric.json`.** Do not edit by hand. This is a collection companion, not a replacement for the scorer.",
        "",
        f"Rubric v{rubric['version']} · {len(rubric['items'])} checks · {rubric['total']} points · {len(rubric['journey'])} journey stages",
        "",
        "## Before you start",
        "",
        "- Record the audit mode: **public**. Do not use an authorized Search Console, GA4, or Ads session in Public Mode.",
        "- **Define the market before you look at results.** Lock the services, market geometry, grid, language, device, query universe, and AI prompts first.",
        "- Resolve the target business with at least one strong identifier (place ID, domain, or phone). Record the match method and confidence.",
        "- Lock the business-competitor cohort. Directories and publishers are SERP occupiers, not contractors.",
        "- Use `verified` only for a directly observed or safely measured fact. Use `strong_signal` when the observation is real but the consequence is not proven.",
        "- A missing observation is `not_collected`, never rank 0. If core coverage is insufficient, return **INSUFFICIENT EVIDENCE**, not a low score.",
        "- Owner-data questions never reduce the public score.",
        "",
        "## Evidence states",
        "",
        "| State | Use when |",
        "|---|---|",
        "| VERIFIED | Directly observed or safely measured. |",
        "| STRONG SIGNAL | The observation is real, but the business consequence cannot be proven from public data. |",
        "| OWNER DATA REQUIRED | The question needs Search Console, analytics, CRM, call, booking, or financial data. |",
        "| NOT APPLICABLE | The check does not reasonably apply to this business, category, geography, configuration, or mode. |",
        "",
        "## Required provenance",
        "",
        "Every source must record: `id`, `provider`, `type`, `method`, `endpoint_family`, `surface`, `collected_at`, `collector_version`, `location_method`, `language`, `device`, `field_completeness`.",
        "",
        "For AI observations, also record: platform, product surface, source type (`consumer_surface` or `model_api`), model/version where available, prompt, market, language, repeat number, and citation behavior.",
        "",
        "Never record credentials, authorization values, cookies, account information, or customer PII in an audit artifact.",
        "",
        "## Query-universe lock",
        "",
        "1. List the services the business actually sells and prioritize them.",
        "2. Generate candidate intents across category, service, emergency, near-me, city-modified, problem/symptom, and high-ticket classes.",
        "3. Attach demand evidence (volume, intent, trend, CPC context). Do not treat CPC as a ranking-quality signal.",
        "4. Deduplicate and classify branded versus non-branded. Branded is diagnostic.",
        "5. Mark core versus diagnostic. Core scoring queries must be non-branded.",
        "6. Generate AI prompts from the same intent IDs, never from a separate GEO list.",
        "7. Review, lock, and hash the universe **before** collecting visibility.",
        "8. Carry the hash into `audit.json`, `scores.json`, and `verification.json`.",
        "",
        "## Geo-grid lock",
        "",
        "1. Center the grid on the market, not on one convenient pin.",
        "2. Choose 3×3, 5×5, 7×7, or a documented custom grid. The delivered-audit default is 7×7 / 49 points.",
        "3. Record the center, radius, point coordinates, generation method, version, and hash.",
        "4. Collect Local Pack, Maps, and Local Finder separately. Never silently merge their ranks.",
        "5. Synthetic fixtures only in tracked examples. Real client coordinates stay local.",
        "",
        "## AI observation rules",
        "",
        "- Keep **mentioned**, **recommended**, and **cited** as separate fields.",
        "- Record every repeat. Aggregate with the documented majority rule.",
        "- Never label a model/API response as a consumer/search surface observation.",
        "- Only validated surfaces contribute to the core score. Experimental sources are diagnostics.",
        "",
    ]
    for stage in sorted(rubric["journey"], key=lambda s: s["order"]):
        stage_checks = [i for i in rubric["items"] if i["id"] in stage.get("checks", [])]
        lines += [f"## {stage['order']}. {stage['label']}", "", f"*{stage['customerQuestion']}*", ""]
        if stage["coverageStatus"] == "owner_data_required":
            lines += [
                "This stage is not scored from public data. Ask the owner:",
                "",
            ]
            for oid in stage.get("ownerData", []):
                entry = next(o for o in rubric["ownerData"] if o["id"] == oid)
                lines.append(f"- **{entry['title']}** ({oid})")
                for question in entry["questions"]:
                    lines.append(f"  - {question}")
            lines.append("")
            continue
        if stage["coverageStatus"] == "observed_unscored" and not stage_checks:
            lines += [
                "This stage is diagnosed by a sibling scorecard, not by Local Visibility:",
                "",
                "- GBP Scorecard: profile identity, services, reviews, conversion actions, and handoff.",
                "- Website Scorecard: page speed, mobile UX, forms, CTA usability, booking flow, and measurement.",
                "",
                "Do not score those surfaces here. Record the observed ranking URL and the handoff context only.",
                "",
            ]
            continue
        for item in stage_checks:
            parts = []
            if item.get("condition"):
                parts.append(f"only if `{item['condition']}`")
            condition = (" · " + " · ".join(parts)) if parts else ""
            lines += [
                f"### {item['id']} — {item['title']} ({item['max']} pts)",
                "",
                f"*{item['principle']}* · {item['severity']} · {item['evaluation']}{condition}",
                "",
                "| Score | Anchor |",
                "|---:|---|",
            ]
            for value in item["allowed"]:
                lines.append(f"| {value} | {item['anchors'][str(value)]} |")
            lines += [
                "",
                f"**Capture:** {item['evidence']}",
                "",
                f"**If weak:** {item['recommendedIntervention']}",
                "",
            ]
        if stage.get("ownerData"):
            lines += ["**Also ask the owner (not scored):**", ""]
            for oid in stage["ownerData"]:
                entry = next(o for o in rubric["ownerData"] if o["id"] == oid)
                lines.append(f"- {entry['title']} ({oid})")
            lines.append("")
    lines += [
        "## Validity gates",
        "",
        "A run is not scoreable until every gate passes. If a gate fails, report **INSUFFICIENT EVIDENCE** and show the failed gate. Never convert a provider outage into a low business score.",
        "",
        "| Gate | Threshold |",
        "|---|---|",
    ]
    for gate in rubric.get("validityGates", []):
        lines.append(f"| {gate['label']} | {gate['threshold']} |")
    lines += [
        "",
        "## Owner-data questions",
        "",
        "| ID | Stage | Question | Why it matters |",
        "|---|---|---|---|",
    ]
    for entry in rubric["ownerData"]:
        lines.append(f"| {entry['id']} | {entry['journeyStage']} | {entry['title']} | {entry['whyItMatters']} |")
    lines += [
        "",
        "## Opportunity flags",
        "",
        "These are never scored. Recommend them separately if the evidence supports them.",
        "",
        "| Flag | Service mapping | Why |",
        "|---|---|---|",
    ]
    for opportunity in rubric["opportunities"]:
        lines.append(f"| {opportunity['label']} | `{opportunity['radModule']}` | {opportunity['why']} |")
    lines.append("")
    lines += [
        "",
        "---",
        "",
        "**Scorecard family boundary:** this reference covers discovery only. The "
        "[GBP Scorecard](https://thatguynef.github.io/gbp-scorecard/) diagnoses profile trust and action; "
        "the [Website Scorecard](https://thatguynef.github.io/website-scorecard/) diagnoses website conversion. "
        "See [The Scorecard Family](https://thatguynef.github.io/local-visibility-scorecard/scorecard-family/).",
    ]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Render the portable Local Visibility checklist.")
    parser.add_argument("--rubric", default=str(DEFAULT_RUBRIC))
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    parser.add_argument("--docs-out", default=str(DOCS_OUT))
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    try:
        rubric = json.loads(Path(args.rubric).read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    rendered = render(rubric)
    outputs = [Path(args.out), Path(args.docs_out)]
    if args.check:
        for out in outputs:
            current = out.read_text(encoding="utf-8") if out.exists() else ""
            if current != rendered:
                print(f"error: {out} is stale. Run: python3 {Path(__file__).name}", file=sys.stderr)
                return 1
            print(f"ok: {out} is current")
        return 0
    for out in outputs:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(rendered, encoding="utf-8")
        print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
