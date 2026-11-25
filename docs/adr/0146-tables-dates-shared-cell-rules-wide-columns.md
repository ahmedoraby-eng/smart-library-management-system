# 0146. Tables and dates: shared cell rules, wide columns from 1440 px, one date format

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** ux
- **Deciders:** UX

## Context

The first UI pass found overflow and inconsistent badges and dates.

## Options considered

| Option | For | Against |
|---|---|---|
| **Shared Table cell kinds and one date format** | fixes overflow once for all tables | rules to learn |

## Decision

- Cell kinds num, nowrap, actions, truncate: numbers, dates and badges never wrap; the action column shrinks; 'Processed by' truncates.
- ISBN column from 1440 px (new 'wide' breakpoint); Borrowed column hidden in recent borrowings below 1440; book detail grid `minmax(0,1fr) 320px`.
- Dates 'Tue, 8 Dec 2026' / '8 Dec 2026' with fixed 3-letter months; one LoanStatusBadge everywhere.

## Consequences

- Each UI pass re-checks these at three widths.

## Sources

Public: web/src/

Also from the owner's working notes and conversations (not published): owner conversation, 2026-11-24; UI review notes, ui-pass-1; UI review notes, ui-pass-2
