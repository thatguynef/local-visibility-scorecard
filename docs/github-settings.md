# GitHub settings

Recommended settings for `thatguynef/local-visibility-scorecard`.

## Repository

- **Description:** Evidence-based local visibility scorecard for home-service businesses. Search, Maps, AI answers, competitors, authority.
- **Topics:** `local-seo`, `local-visibility`, `geo-grid`, `ai-visibility`, `home-services`, `scorecard`, `audit`, `open-source`.
- **Website:** `https://thatguynef.github.io/local-visibility-scorecard/`
- **License:** MIT.

## Branch protection

Require, on `main`:

- the CI workflow;
- the Docs workflow;
- a pull request review;
- conversation resolution;
- linear history if your workflow supports it;
- no force-push and no deletion.

## Security

- Enable **secret scanning** and **push protection**.
- Enable **Dependabot alerts** and **security updates**.
- Enable **private vulnerability reporting**.
- Do not commit `.env`, `.audit/`, `.cache/`, `reports/`, `evals/`, or a real configuration.
- Rotate a DataForSEO credential immediately if it is ever exposed, even if the commit is deleted.

## Pages

1. Open **Settings → Pages**.
2. Set **Source** to **GitHub Actions**.
3. Run the Docs workflow on `main`.
4. Confirm the published URL works without authentication.
5. Confirm the site uses the family palette and typography.

## Actions

- The CI workflow runs offline: no DataForSEO, no live LLM, no paid task, no real business.
- The Docs workflow builds with `--strict` and deploys Pages.
- Pin action major versions and review Dependabot updates.

## Releases

- Tag a release only after the [release checklist](release-checklist.md) passes.
- Include the rubric version, schema version, and any score-affecting change in the release notes.
- Do not attach a real client report to a release.

## Issues

- Use a public issue for a methodology question, a bug with a synthetic reproduction, or a documentation fix.
- Do not use a public issue for a live credential, a real client report, or customer data. Use private vulnerability reporting or the maintainer's private channel.
