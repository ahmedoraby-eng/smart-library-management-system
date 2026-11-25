# 0118. Borrow is one page with a live summary card as the confirmation

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** ux
- **Deciders:** UX

## Context

Borrowing must be fast but still confirmed.

## Options considered

| Option | For | Against |
|---|---|---|
| **Single page: member → book → confirm, summary card is the confirmation** | fewest clicks, still confirmed | busy page |
| Wizard | guided | more clicks |
| Confirm modal | explicit | an extra step |

## Decision

- The right-hand card (member, book, dates, copies 1 → 0) is the confirmation; [Confirm borrowing] is disabled until both are valid.
- Keyboard: Member → Book → Confirm with Enter; Cmd/Ctrl+Enter confirms. Borrow is 3 clicks from a book or member page.
- Blocked choices (0 copies, inactive member, 5 open loans, same title) are listed but not selectable, with a reason; a last-copy race shows an inline notice.
- Success: inline banner with 'Borrow another for <member>' plus a toast; book, loan and dashboard queries refresh.

## Consequences

- Due dates are shown as 'Tue, 8 Dec 2026'.

## Sources

decisions/ux.md:14,229; owner conversation, 2026-11-24; decisions/ux.md:233-243,262; decisions/ux.md:244; decisions/ux.md:246-253
