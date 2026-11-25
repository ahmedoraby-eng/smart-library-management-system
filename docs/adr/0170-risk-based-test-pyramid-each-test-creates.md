# 0170. Risk-based test pyramid; each test creates its own data

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** testing
- **Deciders:** QA

## Context

Tests should be heavy where the risk is and light on plain CRUD.

## Options considered

| Option | For | Against |
|---|---|---|
| **Many unit tests, integration on real Postgres, a few E2E** | effort where it matters | CRUD edge cases less covered |
| Cross-browser and per-field E2E | broad | slow and costly |

## Decision

- Heavy tests on inventory, authorization and AI fallback; plain CRUD gets the happy path + validation.
- Unit tests with in-memory fakes; integration through `app.request()` on Postgres 16; contract tests with shared zod; component tests for two forms.
- Tests create their own data and never depend on the seed (except seed and reset tests).
- Search tests treat `'`, `%` and `;--` as plain text.

## Consequences

- No open critical defects at delivery.

## Sources

Public: api/test/

Also from the owner's working notes and conversations (not published): decisions/test-strategy.md:12,18-29,148; master prompt; decisions/test-strategy.md:11; decisions/test-strategy.md:15; decisions/engineering-plan.md:169; decisions/test-strategy.md:69
