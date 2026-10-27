# Evals

Local eval runs live here by default. Everything except this README is gitignored.

An eval result can contain client evidence even when the prompt does not. Treat `evals/*` as private.

## Rules

- Public eval fixtures are synthetic.
- Never publish a live client's evidence in an eval.
- Do not commit a result file from a real audit.
- The eval harness makes no live model call.
- A result is not a score change; it only measures judgment agreement and evidence quality.

See [Model evaluation](../docs/eval.md) for the harness and metrics.
