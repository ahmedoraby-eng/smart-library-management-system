# 0102. Staff changes run under row locks: never zero Admins, no self-change, demo rows locked

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** security
- **Deciders:** Architecture

## Context

Two Admins editing at once could demote each other or lock everyone out.

## Options considered

| Option | For | Against |
|---|---|---|
| **Lock target + all active Admin rows in one transaction; re-check the actor** | race-safe | a few row locks per change |

## Decision

- `PUT /staff-users/{id}` locks the target and every active Admin row (ordered FOR UPDATE); the actor must be among the locked active Admins, else 403.
- Own change → `409 CANNOT_CHANGE_SELF`; last Admin → `409 LAST_ADMIN`; demo rows → `409 PROTECTED_DEMO_ACCOUNT`.
- Staff users screen is Admin only; no POST (users appear after first sign-in).

## Consequences

- A test has two Admins demote each other in parallel.

## Sources

PR #12/#15; commit b40266f; decisions/ux 3.7 D10; Confluence page 19365918; Jira SLM-8; owner conversation, 2026-11-24; decisions/architecture.md:266; decisions/test-strategy.md:84
