# 0071. One-command local run: `npm run demo:local` with embedded Postgres

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** repo
- **Deciders:** Engineering, architecture review

## Context

Reviewers and the team need to run the app without setup pain; Docker wasn't available on the build Mac.

## Options considered

| Option | For | Against |
|---|---|---|
| **Embedded Postgres 16, free ports, generated local secrets** | no Docker needed | embedded PG differs from Neon (no pgvector) |
| Docker compose + five commands | standard | needs Docker |

## Decision

- `npm run demo:local` starts embedded PG16 on a free port, migrates and seeds, writes a git-ignored `.dev.vars` with a random session secret and random local demo passwords, builds the UI and runs `wrangler dev` with the fake AI.
- It refuses a busy 5432; `docker compose up -d db` remains the alternative.

## Consequences

- The local path uses the brute-force vector fallback (ADR 0018).

## Sources

Public: PR #10; commit f0d1ccc

Also from the owner's working notes and conversations (not published): design notes; owner conversation, 2026-11-24; decisions/architecture.md:345; decisions/engineering-plan.md:164; Jira SLM-6
