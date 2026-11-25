# 0030. Cut order if time runs short

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** scope
- **Deciders:** Product owner, architecture review

## Context

A 3-day build needs a known order of what to drop, decided before the pressure starts.

## Options considered

| Option | For | Against |
|---|---|---|
| **Cut extras first, never the core** | protects what the brief grades | late extras may not ship |

## Decision

- Cut first: ISBN autofill, then badges → dashboard → AI explanations (keep deterministic discovery) → Google sign-in (keep demo accounts + RBAC).
- Never cut: book CRUD, search, borrow, return, database integrity, backend RBAC, deploy, README, demo accounts.
- AI discovery is P2 but the last P2 to cut, because the role assessed is an AI engineering manager.

## Consequences

- Nothing was cut in the end; the order stays as the rule for any late change.

## Sources

decisions/engineering-plan.md:156-158; decisions/scope.md:35; decisions/scope.md:28
