# 0141. Member detail: Borrow a book, On loan / History tabs with inline Return

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** ux
- **Deciders:** UX

## Context

Staff often start from a member at the desk.

## Options considered

| Option | For | Against |
|---|---|---|
| **Tabs with inline actions** | fewer screens | more on one page |
| Single loans table, open first | simpler | worse flow |

## Decision

- Member number is server-generated and read-only; members are deactivated, never deleted.
- Detail page: [Borrow a book] (prefilled, disabled for inactive members), 'On loan (n of 5)' and History tabs with inline Return through the shared confirm dialog.
- Discovery has an optional 'For member' so [Borrow] prefills book and member.

## Consequences

- Replaced the earlier single loans table.

## Sources

decisions/ux.md:198-203; PR #7; PR #11
