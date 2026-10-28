---
description: "The five judgment-only Local Visibility checks, the structured proposal shape, and the rules that keep deterministic facts out of the model layer."
---

# Judgment layer

Most visibility checks are deterministic. Five require a reviewer or a model:

| Check | Question |
|---|---|
| `LV-ORG-05` | Is the ranking URL relevant to the intent? |
| `LV-AI-04` | Is the AI mention for the relevant service? |
| `LV-AI-05` | Is the AI mention in the target market? |
| `LV-AI-06` | Is the entity accurate in the AI answer? |
| `LV-AUT-02` | Is the external source genuinely local? |

The judgment layer exists so a model can help with classification without touching deterministic facts or inventing points.

## Workflow

1. The collector writes a pending worksheet.
2. A reviewer or model reads the evidence.
3. The proposal is written as `judgment.json`.
4. `apply_judgment.mjs` merges it into `audit.filled.json`.
5. The scorer validates the result.

```sh
node .opencode/skills/home-service-local-visibility-audit/scripts/apply_judgment.mjs \
  --audit .audit/acme/audit.json \
  --judgment .audit/acme/judgment.json \
  --out .audit/acme/audit.filled.json
```

## Proposal shape

```json
{
  "schema_version": "1.0",
  "audit_mode": "public",
  "model": {
    "name": "reviewer-name",
    "provider": "fixture",
    "reviewed_at": "2026-01-01T00:00:00Z"
  },
  "checks": {
    "LV-AI-04": {
      "score": 2,
      "confidence": "strong_signal",
      "evidence": ["Every observed mention is for the service in the prompt."],
      "evidence_refs": ["google-ai-mode", "chatgpt-llm"]
    }
  }
}
```

## Rules

- Only `evaluation: model_judgment` checks may be judged.
- A deterministic check cannot be judged.
- An owner-data ID cannot be judged.
- A configured N/A check cannot be judged.
- Every judgment needs evidence and at least one valid source reference.
- The score must be one of the check's allowed anchors.
- The confidence must be `verified` or `strong_signal`.
- The model cannot invent a source ID.
- The model cannot change a deterministic fact, a metric, or another check.

`--allow-partial` is available for an incremental review. Without it, every applicable judgment check must be present.

## What the scorer does with it

The scorer does not re-judge the proposal. It validates the merged audit like any other audit: applicability, allowed scores, evidence, confidence, and source references. A judgment check with no evidence fails validation.

## What the judgment layer must not do

- Write the report prose as a substitute for a score.
- Select a service for the fix mapping.
- Change the query universe.
- Change a rank, a metric, or a validity gate.
- Invent a source.
- Treat a directory as a local contractor.
- Turn a model's opinion into a VERIFIED finding without direct evidence.

## Offline evaluation

`eval.mjs` scores pre-collected responses from one or more reviewers against a filled synthetic audit. It reports agreement, evidence citation, unsupported claims, false target matches, and unstable checks.

```sh
npm run eval -- --snapshot examples/acme-plumbing --mock
```

The eval harness makes no live model call. Public eval fixtures are synthetic.

## Why only five checks

The rest of the rubric is deterministic from normalized observations. That is deliberate. A score that depends on a model's prose for 20 checks is harder to reproduce and easier to manipulate. Judgment is reserved for classification questions that structured parsing cannot settle.

---

**Related:** [The Scorecard Family](scorecard-family.md) · [Website Scorecard](https://thatguynef.github.io/website-scorecard/) · [GBP Scorecard](https://thatguynef.github.io/gbp-scorecard/)
