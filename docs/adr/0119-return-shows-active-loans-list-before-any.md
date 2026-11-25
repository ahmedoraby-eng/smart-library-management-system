# 0119. Return shows the active-loans list before any search, overdue first

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** ux
- **Deciders:** UX

## Context

Most returns are for loans already on screen.

## Options considered

| Option | For | Against |
|---|---|---|
| **List first, one autofocused search box** | no typing for common cases | long list in a big library |

## Decision

The Return tab lists all active loans at once (overdue first, then soonest due). An exact ISBN or member number with one result highlights it and focuses its [Return].

## Consequences

- Pagination would be needed for a large library.

## Sources

decisions/ux.md:15,256-258
