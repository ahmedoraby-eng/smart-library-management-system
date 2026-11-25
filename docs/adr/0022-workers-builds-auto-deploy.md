# 0022. Auto-deploy through Workers Builds; migrations by hand behind a migrations gate

- **Status:** Accepted
- **Date:** 2026-11-25
- **Deciders:** Ahmed Oraby (owner), architecture review

## Context

Every merge to `main` should reach production:
- without a manual deploy;
- without a Cloudflare token or the database string in GitHub;
- without an unattended schema change.

## Options considered

| Option | For | Against |
|---|---|---|
| Actions + wrangler ([0021](0021-github-actions-wrangler-deploy.md)) | everything in one workflow | secrets in GitHub; migrations run blind |
| **Cloudflare Workers Builds (Git integration) + manual migrations + a gate** | no deploy secret in GitHub; schema changes are deliberate | the migration is a manual step before the merge |

## Decision

- **Deploy:** on each merge to `main`, Workers Builds runs `npm ci`, `npm run build` and `npx wrangler deploy --env production`.
  - It reports the check `Workers Builds: smart-library` on the merge commit.
  - Builds for non-production branches are off.
  - Worker secrets are set once and persist across deploys.
- **Migrations:** applied by hand on production, before the PR that adds them is merged.
  - The **`migrations gate`** check fails on a PR that changes `migrations/` until it has the label `migrations-applied`.
- **By hand:** `npm run deploy` stays for a manual deploy. Rollback is a Workers version rollback.

## Consequences

- Migrations must work with the running version, because they land before the code.
- A failed build leaves the previous version live.
