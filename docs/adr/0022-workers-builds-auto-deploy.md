# 0022. Auto-deploy through Workers Builds; migrations by hand behind a migrations gate

- **Status:** Accepted (supersedes [0021](0021-github-actions-wrangler-deploy.md), [0160](0160-manual-deploy-npm-run-deploy-deploy-branch.md))
- **Date:** 2026-11-25
- **Area:** cicd
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

## Notes

Go-live order: merge the production config first, then connect Workers Builds, then the issue-close workflow; a wrong order could drop Hyperdrive or AI from the live site. Rollback is the dashboard's previous version or wrangler rollback, with the owner's OK; the local deploy folder is kept for a hand rollback. Optional build variable NODE_VERSION=22. Connecting Cloudflare to GitHub needed one owner approval.

> Ahmed Oraby: «لا بس اللي يظبط الديبلوي الاوتوماتيك طبعا للابلكيشن»

## Sources

Public: commit 7a35f93; docs/architecture.md Deployment; PR #25; .github/workflows/migrations-gate.yml; commit 7f86409; PR #24

Also from the owner's working notes and conversations (not published): design notes; owner conversation, 2026-11-25; backlog/slm-tickets-draft.md:158-164
