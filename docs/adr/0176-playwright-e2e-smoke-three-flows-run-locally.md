# 0176. Playwright E2E smoke: three flows, run locally on a throwaway stack, not in CI

- **Status:** Superseded by [0184](0184-e2e-smoke-runs-github-ci-traces-kept.md) (supersedes [0175](0175-six-playwright-e2e-journeys-ci-plus-run.md))
- **Date:** 2026-11-24
- **Area:** testing
- **Deciders:** QA, engineering

## Context

The time box and the public repo made browser tests in CI costly; the app has no auth bypass to lean on.

## Options considered

| Option | For | Against |
|---|---|---|
| **`npm run e2e` on embedded PG16 + wrangler dev on free ports** | isolated; no bypass flag | not in CI |
| E2E in CI | runs on every PR | CI time; needs secrets and trace support first |

## Decision

- Flows: Librarian add book → borrow → return → history; Supervisor read-only (direct `POST /api/books` → 403); Admin resets demo data.
- The Supervisor fixture is a row inserted in the throwaway DB with a cookie signed by the run's own secret.
- It always cleans up. Moving it to CI needs trace retain-on-failure first.

## Consequences

- Recorded as the highest-value known testing gap.

## Sources

Public: PR #17; README Tests; commit 4156f01

Also from the owner's working notes and conversations (not published): owner conversation, 2026-11-24; Jira SLM-11; Confluence page 19333121; handover notes; design notes
