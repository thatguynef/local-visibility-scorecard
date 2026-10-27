#!/usr/bin/env python3
"""Render the canonical fix library from rubric.json."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_RUBRIC = HERE.parent / "references" / "rubric.json"
DEFAULT_OUT = HERE.parent / "references" / "fix-library.md"
DOCS_OUT = HERE.parent.parent.parent.parent / "docs" / "fix-library.md"


def render(rubric: dict) -> str:
    by_id = {item["id"]: item for item in rubric["items"]}
    lines = [
        "# Fix Library",
        "",
        "> **Generated from `rubric.json`.** Do not edit by hand. Run `python3 render_fix_library.py`.",
        "",
        "The fix library is a deterministic mapping from a failed check to a bounded intervention. It is not a sales menu. A recommendation is evidence-backed only when the corresponding check lost points and the evidence supports the finding.",
        "",
        "A service mapping is metadata. The scorecard remains useful without RAD, and the existence of an optional service is never the reason a business loses points.",
        "",
        "## Priority order",
        "",
        "| Priority | Meaning |",
        "|---|---|",
        "| critical | Can leave the business undiscoverable for commercially important demand. |",
        "| high | Materially reduces visibility on a surface, service, or area that matters. |",
        "| medium | Creates a measurable gap or fragility, but a workaround exists. |",
        "| low | Improves durability or measurement without changing the core discovery picture. |",
        "",
        "## Check mappings",
        "",
        "| Check | Priority | Failure | Fix | Service mapping | Cross-scorecard |",
        "|---|---|---|---|---|---|",
    ]
    for fix in sorted(rubric["fixes"], key=lambda f: (["critical", "high", "medium", "low"].index(f["priority"]), f["checkId"])):
        item = by_id[fix["checkId"]]
        modules = ", ".join(f"`{module}`" for module in fix["radModules"]) or "—"
        cross = fix.get("crossScorecard") or item.get("serviceMapping") or "—"
        lines.append(
            f"| {fix['checkId']} | {fix['priority']} | {item['title']} | {fix['fix']} | {modules} | {cross} |"
        )
    lines += [
        "",
        "## Opportunity flags",
        "",
        "These are never scored. Recommend them only when the evidence and the business model support them.",
        "",
        "| Opportunity | Service mapping | Why it may matter |",
        "|---|---|---|",
    ]
    for opportunity in rubric["opportunities"]:
        lines.append(f"| {opportunity['label']} | `{opportunity['radModule']}` | {opportunity['why']} |")
    lines += [
        "",
        "## Cross-scorecard routing",
        "",
        "A Local Visibility finding may require a sibling diagnosis. Route the question; do not score it twice.",
        "",
        "| Finding | Route to | Why |",
        "|---|---|---|",
        "| The business is absent from Maps or the Local Pack for a service it sells | GBP Scorecard | Confirm category, services, location, and profile configuration before treating it as a pure visibility defect. |",
        "| Maps is strong but organic visibility is weak | Website Scorecard + content diagnosis | Check whether a service page exists and matches the intent; Website Scorecard judges page quality, not Local Visibility. |",
        "| The ranking URL is generic or unrelated | Website Scorecard | Local Visibility can identify the URL. Website Scorecard judges whether the page itself serves the customer. |",
        "| The business is mentioned by AI but rarely recommended or cited | Market intelligence / authority work | Investigate entity corroboration, third-party sources, and citable content. |",
        "| A competitor outranks the business across the market | Market intelligence | Compare source ecosystems, service coverage, and geographic presence. |",
        "| The business has no non-branded discovery at all | Market intelligence | Treat as a strategic visibility problem; confirm the market and services are correct before prescribing tactics. |",
        "",
        "## How to use a mapping",
        "",
        "1. Confirm the check is applicable and lost points.",
        "2. Confirm the evidence state: VERIFIED or STRONG SIGNAL.",
        "3. Use the check's recommended intervention, not a generic checklist fix.",
        "4. Keep the report's points claim within the recoverable points.",
        "5. Treat the service mapping as an optional implementation path, not a diagnosis.",
        "6. If the finding belongs to a sibling scorecard, route it instead of scoring it here.",
        "",
        "## What not to do",
        "",
        "- Do not recommend a service merely because it exists.",
        "- Do not claim a revenue lift from a fix.",
        "- Do not bundle unrelated checks into one oversized claim.",
        "- Do not use a model to choose a service; use the deterministic mapping.",
        "- Do not recommend a fix that requires private data the audit does not have.",
        "- Do not treat a directory or publisher as a local contractor competitor.",
        "- Do not pool consumer/search AI surfaces with model/API responses.",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Render the Local Visibility fix library.")
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
