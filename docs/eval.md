---
description: "The offline judgment evaluation harness for the Local Visibility Scorecard: agreement, evidence citation, unsupported claims, and synthetic-only rules."
---

# Model evaluation

The eval harness tests the judgment layer offline. It does not call a live model.

## Mock run

```sh
npm run eval -- --snapshot examples/acme-plumbing --mock
```

The mock uses the fixture's judgment checks as a baseline and creates a second response set with one deliberate disagreement. This proves the harness can detect disagreement. It is not a quality measurement.

The same mock run is exercised by `npm test`, so CI catches a broken eval path without calling a model.

## Pre-collected responses

```sh
npm run eval -- \
  --snapshot examples/acme-plumbing \
  --responses evals/run.json \
  --out evals/run-result.json
```

Response shape:

```json
{
  "models": [
    {
      "name": "reviewer-a",
      "checks": {
        "LV-AI-04": {
          "score": 2,
          "confidence": "strong_signal",
          "evidence_refs": ["google-ai-mode", "chatgpt-llm"]
        }
      }
    }
  ]
}
```

Only `model_judgment` checks are sampled. Owner-data questions are never evaluated. Deterministic facts are not re-judged.

## Metrics

| Metric | Meaning |
|---|---|
| `agreement_rate` | Share of sampled checks where the reviewer matched the baseline score |
| `severity_disagreements` | Confidence-label disagreements |
| `evidence_citation_rate` | Share of responses with valid source references |
| `unsupported_claim_rate` | Responses that make a claim without valid references |
| `hallucinated_check_ids` | Check IDs that do not exist in the rubric |
| `unstable_checks` | Checks where reviewer scores spread by more than one point |

## What to test

The V1 judgment set is small, so the eval should focus on the questions that matter:

- target/entity matching when the AI answer is ambiguous;
- AI recommendation versus mention;
- citation versus source-list inclusion;
- service relevance;
- location relevance;
- local versus generic source classification.

## Public eval fixtures are synthetic

Never publish a live client's evidence in a public eval. `evals/*` is gitignored except `evals/README.md`. A result file can contain client evidence even when the prompt does not.

## What the harness is not

- It is not a model leaderboard.
- It is not a substitute for direct evidence.
- It does not change a score.
- It does not call an API.
- It does not decide which service to recommend.

The point is to make disagreement observable before it becomes a client report.

---

**Related:** [The Scorecard Family](scorecard-family.md) · [Website Scorecard](https://thatguynef.github.io/website-scorecard/) · [GBP Scorecard](https://thatguynef.github.io/gbp-scorecard/)
