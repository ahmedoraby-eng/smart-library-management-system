# 0021. Deploy from GitHub Actions with wrangler, with migrations in the deploy job

- **Status:** Superseded by [0022](0022-workers-builds-auto-deploy.md)
- **Date:** 2026-11-24
- **Deciders:** Ahmed Oraby (owner), architecture review

## Context

The first plan deployed on every push to `main` from a GitHub Actions job: migrations, `wrangler deploy`, then a smoke check.

## Options considered

| Option | For | Against |
|---|---|---|
| Actions + wrangler | one pipeline | a Cloudflare API token and the database string in GitHub secrets; migrations run unattended |

## Decision

Deploy from Actions, with the migrations in the deploy job.

## Consequences

Replaced. Cloudflare's Git integration deploys without a token in GitHub, and migrations moved to a deliberate manual step behind a gate.
