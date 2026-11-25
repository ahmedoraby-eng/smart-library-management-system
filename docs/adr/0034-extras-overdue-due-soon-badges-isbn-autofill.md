# 0034. Extras: overdue/due-soon badges and ISBN autofill; CSV import skipped

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** scope
- **Deciders:** Product owner

## Context

The brief invites creative extras. The best demo value per hour wins.

## Options considered

| Option | For | Against |
|---|---|---|
| **Overdue/due-soon badges + ISBN lookup from Open Library** | cheap, visible, useful daily | no bulk import |
| CSV import with row validation | bulk data entry | medium size, more risk than demo value |
| Member quick view as its own story | handy | only if time remains |

## Decision

- Build an overdue/due-soon indicator (small) and ISBN autofill from Open Library (small–medium).
- Skip CSV import.
- A member 'currently borrowed' panel only if time remains (it landed as member detail tabs).

## Consequences

- CSV import is listed as a future improvement.

## Sources

Public: README.md

Also from the owner's working notes and conversations (not published): Jira SLM-13; Confluence page 19365918; decisions/extras.md:38-42; decisions/scope.md:51; owner conversation, 2026-11-24; decisions/ux.md:27
