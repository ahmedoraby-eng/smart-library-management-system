# 0057. API contracts frozen before UI integration

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** process
- **Deciders:** Engineering, architecture review

## Context

UI and API were built in parallel by different agents.

## Options considered

| Option | For | Against |
|---|---|---|
| **Freeze `contracts/` early** | parallel work without drift | late contract changes cost more |

## Decision

`contracts/` (BookDto and other DTOs, error codes, `Me.isDemo`, `StaffUser.isDemo`, search-param schemas) is frozen before UI integration.

## Consequences

- Changes after the freeze go through review.

## Sources

Public: docs/decisions.md

Also from the owner's working notes and conversations (not published): decisions/engineering-plan.md:117-119; decisions/architecture.md:388
