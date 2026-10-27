#!/usr/bin/env python3
"""Render references/coverage-matrix.json from the canonical rubric.

The matrix records what is scored, what is diagnostic, what is conditional,
what requires owner data, and what belongs to a sibling scorecard.

Usage:
  python3 render_coverage.py
  python3 render_coverage.py --check
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_RUBRIC = HERE.parent / "references" / "rubric.json"
DEFAULT_OUT = HERE.parent / "references" / "coverage-matrix.json"


def build(rubric: dict) -> dict:
    checks = []
    for item in rubric["items"]:
        checks.append(
            {
                "id": item["id"],
                "title": item["title"],
                "category": item["cat"],
                "categoryName": next(c["name"] for c in rubric["categories"] if c["id"] == item["cat"]),
                "journeyStage": item["journeyStage"],
                "max": item["max"],
                "evidenceType": item["evidenceType"],
                "evaluation": item["evaluation"],
                "applicability": item["applicability"],
                "condition": item.get("condition"),
                "severity": item["severity"],
                "serviceMapping": item["serviceMapping"],
                "publicMode": "scored",
                "connectedMode": "unchanged; authorized diagnostics are reported separately",
                "ownerData": False,
            }
        )
    journeys = []
    for stage in sorted(rubric["journey"], key=lambda s: s["order"]):
        stage_checks = [c for c in checks if c["journeyStage"] == stage["id"]]
        journeys.append(
            {
                "id": stage["id"],
                "order": stage["order"],
                "label": stage["label"],
                "customerQuestion": stage["customerQuestion"],
                "coverageStatus": stage["coverageStatus"],
                "scoredChecks": stage.get("checks", []),
                "ownerData": stage.get("ownerData", []),
                "applicableMax": sum(c["max"] for c in stage_checks),
                "note": "Owner-data stage is diagnosed, never scored."
                if stage["coverageStatus"] == "owner_data_required"
                else (
                    "Handoff is diagnosed by GBP and Website Scorecards; Local Visibility stops at discovery and comparison."
                    if stage["coverageStatus"] == "observed_unscored"
                    else "Scored by the public visibility rubric."
                ),
            }
        )
    return {
        "schema_version": "1.0",
        "generated": True,
        "source": "references/rubric.json",
        "rubric_version": rubric["version"],
        "framework": rubric["framework"],
        "total": rubric["total"],
        "statusDefinitions": {
            "scored": "Contributes to the public score.",
            "diagnostic": "Observed and reported, but not a universal scored penalty.",
            "conditional": "Scored only when its configured condition applies.",
            "owner_data_required": "Requires Search Console, analytics, CRM, call, booking, or financial data; never reduces the public score.",
            "observed_unscored": "Reported for context only; owned by a sibling scorecard.",
            "not_applicable": "Does not reasonably apply to this business, category, geography, configuration, or audit mode.",
        },
        "categories": [
            {
                "id": cat["id"],
                "name": cat["name"],
                "max": cat["max"],
                "question": cat["question"],
                "checks": [c["id"] for c in checks if c["category"] == cat["id"]],
            }
            for cat in rubric["categories"]
        ],
        "journey": journeys,
        "checks": checks,
        "validityGates": rubric.get("validityGates", []),
        "facts": rubric.get("facts", []),
        "ownerData": [
            {
                "id": entry["id"],
                "journeyStage": entry["journeyStage"],
                "title": entry["title"],
                "scored": False,
                "publicMode": "owner_data_required",
                "serviceMapping": entry["serviceMapping"],
                "questions": entry["questions"],
            }
            for entry in rubric["ownerData"]
        ],
        "opportunities": [
            {
                "id": opportunity["id"],
                "label": opportunity["label"],
                "scored": False,
                "serviceMapping": opportunity["radModule"],
                "why": opportunity["why"],
            }
            for opportunity in rubric["opportunities"]
        ],
        "serviceMappings": rubric.get("serviceMappings", []),
        "crossScorecard": rubric.get("crossScorecard", []),
        "publicMode": {
            "auditMode": "public",
            "provider": "dataforseo",
            "implementationProvider": "DataForSEO is an implementation provider, not the methodology.",
            "credentials": "DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD via environment only",
            "mutation": "none",
            "ownerDataInScore": False,
            "gridDefault": "7x7 / 49 points",
            "aiSourceSeparation": "consumer/search surfaces and model/API surfaces are never pooled",
            "minimumValidAiSurfaces": 1,
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Render the Local Visibility coverage matrix.")
    parser.add_argument("--rubric", default=str(DEFAULT_RUBRIC))
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    try:
        rubric = json.loads(Path(args.rubric).read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    rendered = json.dumps(build(rubric), indent=2, sort_keys=True) + "\n"
    out = Path(args.out)
    if args.check:
        current = out.read_text(encoding="utf-8") if out.exists() else ""
        if current != rendered:
            print(f"error: {out} is stale. Run: python3 {Path(__file__).name}", file=sys.stderr)
            return 1
        print(f"ok: {out} is current")
        return 0
    out.write_text(rendered, encoding="utf-8")
    print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
