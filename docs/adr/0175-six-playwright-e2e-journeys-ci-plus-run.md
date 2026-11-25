# 0175. Six Playwright E2E journeys in CI, plus a run on the live URL

- **Status:** Superseded by [0176](0176-playwright-e2e-smoke-three-flows-run-locally.md)
- **Date:** 2026-11-24
- **Area:** testing
- **Deciders:** QA

## Context

The first test strategy planned browser tests as part of the merge gate.

## Options considered

| Option | For | Against |
|---|---|---|
| **6 Chromium journeys, storage-state login, live run by workflow_dispatch** | real browser proves wiring | CI time and secrets |

## Decision

Journeys: Borrow, Return, Search (Supervisor), AI fallback, Catalog admin + delete rules, Demo accounts and reset; retries 1, suite < 3 min; a live run with E2E- prefixed data and cleanup.

## Consequences

- Replaced by a three-flow local smoke; E2E in CI waits for trace-on-failure.

## Sources

decisions/test-strategy.md:135-148; decisions/test-strategy.md:177,189; decisions/infra.md:75
