# 0088. ISBN is unique among active books only

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** data
- **Deciders:** Architecture

## Context

An archived book's ISBN may need to come back as a new record.

## Options considered

| Option | For | Against |
|---|---|---|
| **Partial unique index where isbn is not null and not archived** | archive doesn't block re-adding | two rows may share an ISBN over time |

## Decision

- Unique index on isbn where isbn is not null and the book is not archived (`409 DUPLICATE_ISBN`).
- member_number and member email are unique.

## Consequences

- The UI links to the existing book from the 409 context.

## Sources

Public: docs/architecture.md

Also from the owner's working notes and conversations (not published): decisions/architecture.md:177-178; Confluence page 19398657; Jira SLM-1
