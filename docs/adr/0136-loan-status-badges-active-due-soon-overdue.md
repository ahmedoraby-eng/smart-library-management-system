# 0136. Loan status badges: Active, Due soon, Overdue, Returned

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** ux
- **Deciders:** UX

## Context

Loan state must read the same on every screen.

## Options considered

| Option | For | Against |
|---|---|---|
| **One `loanStatus()` util and one LoanStatusBadge** | consistent everywhere | one shared component to keep right |

## Decision

- Active = info; Due soon = warning ('Due in 2 days' / 'Due today'); Overdue = danger 'Overdue · N days' with a row tint; Returned = neutral.
- Overdue is red, due-soon amber; no fees or fines shown; Return can sort overdue first.

## Consequences

- The due-soon window is a separate decision.

## Sources

decisions/ux.md:125-129; decisions/extras.md:6-12
