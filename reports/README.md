# Reports

Client report packages live here by default:

```text
reports/<domain>/<run-id>/
```

Everything except this README is gitignored.

A report package may contain:

- `audit.filled.json`
- `scores.json`
- `content.json`
- `one-page.md`
- `full-report.md`
- `verification.json`
- local screenshots or notes

## Rules

- Keep client reports local.
- Do not commit a real report, screenshot, or client name.
- Do not publish a report without explicit client approval and a sanitization pass.
- Raw evidence belongs in `.audit/` or `.cache/`, not here.
- Delete a report when it is no longer needed.

A public example belongs in `examples/`, not `reports/`. Public examples must be synthetic or sanitized and labeled accordingly.
