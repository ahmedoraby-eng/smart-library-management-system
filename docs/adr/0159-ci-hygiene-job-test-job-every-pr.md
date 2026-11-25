# 0159. CI: a hygiene job and a test job on every PR and push to main

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** cicd
- **Deciders:** Engineering, architecture review

## Context

Every change must be checked for leaks and for correctness on real Postgres.

## Options considered

| Option | For | Against |
|---|---|---|
| **Two parallel jobs on GitHub Actions, read-only token** | free for public repos; fast | fork PRs get no secrets |

## Decision

- **hygiene** (5 min): gitleaks and a grep for forbidden names.
- **test** (15 min): Node 22, `postgres:16` service, typecheck, `lint:deps`, `npm test`, build.
- A newer push cancels the older run. Budgets: CI < 8 min.

## Consequences

- More gates were added later (next ADRs).

## Sources

design notes; ci.yml on origin/main; commit 4723055; Confluence page 19333121; Confluence page 19365889; decisions/architecture.md:339-342; decisions/infra.md:71-75; decisions/test-strategy.md:170-177; decisions/test-strategy.md:175-177
