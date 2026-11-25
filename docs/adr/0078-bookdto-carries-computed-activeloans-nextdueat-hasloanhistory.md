# 0078. BookDto carries computed activeLoans, nextDueAt and hasLoanHistory

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** architecture
- **Deciders:** Architecture

## Context

Badges, 'next copy due back' and the delete dialog need loan facts on every book row.

## Options considered

| Option | For | Against |
|---|---|---|
| **Computed per query in one LEFT JOIN aggregate** | never stale | a join on every list |
| Store the derived fields | cheap reads | can go stale |

## Decision

- The same BookDto in lists and details adds `activeLoans`, `nextDueAt` and `hasLoanHistory`.
- They are computed in one aggregate query, never stored.

## Consequences

- The delete dialog can say beforehand whether it will archive or delete.

## Sources

Public: docs/architecture.md

Also from the owner's working notes and conversations (not published): decisions/architecture.md:245-257; owner conversation, 2026-11-24; decisions/ux.md:294
