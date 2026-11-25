# 0087. Deleting a book: blocked with open loans, archived with history, deleted if never borrowed

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** data
- **Deciders:** Product owner, architecture review

## Context

The brief asks for delete, but loan history must survive.

## Options considered

| Option | For | Against |
|---|---|---|
| **Three outcomes decided by loan history** | history kept; delete still works | 'delete' sometimes means archive |
| Hard delete always | literal | destroys history |
| Block if any loan exists | simple | old books can't be removed |

## Decision

- Open loans → `409 BOOK_HAS_ACTIVE_LOANS`.
- Only past loans → archived (`archived_at`): leaves catalogue, search and KPIs; history stays.
- Never borrowed → hard delete.
- `loans.book_id ON DELETE RESTRICT`. Response `{result: archived|deleted}`; the dialog says beforehand which will happen and shows the past-loan count.

## Consequences

- Archived books show an 'Archived' tag in history.

## Sources

Confluence page 19398657; Jira SLM-1; owner conversation, 2026-11-24; docs/architecture.md; commit cefd097; decisions/architecture.md:195,232; decisions/scope.md:42; backlog/slm-tickets-draft.md:71-82; decisions/ux.md:192-196
