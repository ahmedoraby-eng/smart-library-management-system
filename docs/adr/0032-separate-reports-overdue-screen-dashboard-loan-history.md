# 0032. No separate Reports or Overdue screen; the dashboard and loan history cover them

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** scope
- **Deciders:** UX, product owner

## Context

The brief's navigation lists reports. A separate screen would repeat the dashboard's numbers.

## Options considered

| Option | For | Against |
|---|---|---|
| **Dashboard + loan-history filters are the reports** | no empty or duplicate screen | no dedicated Reports page |
| Separate Reports screen | matches the brief's nav | repeats the same numbers |

## Decision

- No Reports screen and no Overdue screen.
- `/loans?status=overdue` is linked from the dashboard KPI.
- Navigation shows only implemented scope.

## Consequences

- A reporting screen can be added later on the same queries.

## Sources

decisions/scope.md:47; decisions/ux.md:13
