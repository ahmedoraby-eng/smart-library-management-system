# 0007. Loan status derived at read time (OVERDUE is never stored)

- **Status:** Accepted
- **Date:** 2026-11-24
- **Deciders:** Ahmed Oraby (owner), architecture review

## Context

A loan is ACTIVE, RETURNED or OVERDUE. A stored status needs a job to flip it, and it can disagree with the dates.

## Options considered

| Option | For | Against |
|---|---|---|
| Stored status + scheduled job | simple reads | stale between runs; a job to operate |
| **Derived: `returned_at` set → RETURNED; open and `due_at < now` → OVERDUE; else ACTIVE** | never stale, no scheduler | the expression must be the same everywhere |

## Decision

The status is computed in one SQL fragment (`loanSql.ts`), used by the list filter, each row and the dashboard count.

## Consequences

- The list, each row and the dashboard can't disagree.
- Filtering by OVERDUE is an expression on the indexed `(returned_at, due_at)` pair, which is fine at this size.
