# Security Policy

## Supported versions

The current `1.x` line is supported. There is no legacy line yet. Pre-1.0 tags are not supported.

## Reporting a vulnerability

Please **do not open a public issue** for a live vulnerability, exposed credential, customer-data leak, or exploitable detail.

Use GitHub's private vulnerability reporting for `thatguynef/local-visibility-scorecard` if it is available. If it is not, contact the maintainer through the GitHub profile associated with the repository and ask for a private channel. Do not include the secret itself in the first message.

Include:

- what is affected,
- how to reproduce it without real customer data,
- the potential impact,
- whether any credential or personal data is exposed,
- a suggested fix if you have one.

## Scope

In scope:

- credential exposure in the repository or Git history, including DataForSEO login, password, and Basic Authorization values,
- customer PII, real audit evidence, geo-grid coordinates for a real client, or private client data in tracked files,
- path traversal or unsafe file handling in the scripts,
- command injection or unsafe shell interpolation,
- URL validation bypasses or unsafe redirect handling,
- authorization-header or credential logging,
- generated-output path issues,
- a verifier invariant that can be bypassed,
- a privacy regression in the public examples,
- a cost-control bypass that could place paid provider tasks without an explicit ceiling.

Out of scope:

- findings about a business audited with this tool,
- the accuracy of a third-party SERP, AI, or backlink response,
- denial-of-service against a site you do not own,
- social engineering,
- requests to audit a business without authorization.

## Security design boundaries

- The collector is read-only. It makes search and data-provider requests only. It does not contact the audited business, submit a form, create a booking, place a call, send a message, post a review, or change a profile.
- Public Mode uses DataForSEO as the implementation provider. The methodology and normalized data model remain provider-agnostic.
- Credentials come from environment variables only. They are never written to an audit artifact, query universe, cache key, URL, log, report, or exception.
- The application never loads `.env` automatically. `.env.example` contains variable names only.
- Every outbound HTTP request has an explicit timeout, a bounded response size, bounded retries, and bounded concurrency.
- Paid requests require an explicit plan. `--dry-run` makes no paid request. Task-count ceilings are enforced. A cost ceiling is enforced when a local pricing file is supplied; otherwise the tool reports that a reliable cost estimate is unavailable rather than inventing one.
- Raw provider responses stay in `.cache/` or `.audit/`, which are gitignored.
- The verifier is file-based. It never re-runs the collector or contacts the business.
- CI uses synthetic fixtures only. It makes no DataForSEO request, no live-model request, and no paid task.

## If a credential was committed

1. **Stop.** Do not simply delete the file and continue.
2. Treat the credential as exposed. Rotate it vendor-side immediately, even if the file is now deleted.
3. Remove it from the current tree.
4. Tell the maintainer privately.
5. Do not assume the history is clean. Removing a file from `HEAD` does not remove it from earlier commits.
6. History rewriting requires explicit owner authorization, a backup, a coordinated force-push, and re-cloning by collaborators.
7. Re-run `node scripts/privacy_scan.mjs --history`.

Deleting a commit is not rotation. Deleting a repository does not revoke a key. Forks, clones, caches, and mirrors may retain the value.

## Non-destructive testing

A security report should not require you to violate the read-only boundary. Use the synthetic fixture, local files, and a localhost server you control. CI never audits a real business.

## Dependency policy

This repository intentionally has no runtime npm dependencies. Node.js and Python standard libraries are used directly. A new dependency must materially improve security, correctness, or maintainability; it must be pinned, reviewed, and reflected in the release checklist.
