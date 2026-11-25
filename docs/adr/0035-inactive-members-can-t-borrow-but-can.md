# 0035. Inactive members can't borrow but can still return; archived books can be returned

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** scope
- **Deciders:** Product owner

## Context

A deactivated member or archived book may still have open loans.

## Options considered

| Option | For | Against |
|---|---|---|
| **Only borrow checks ACTIVE; return needs only an open loan** | copies always come back | an inactive member still appears in return lists |

## Decision

- Borrow by an inactive member gives `409 MEMBER_INACTIVE`.
- Return is accepted for inactive members and archived books; `returned_at = now`.
- Inactive members stay selectable in Discovery; the Borrow page blocks them.

## Consequences

- Stock can't get stuck because of a status change.

## Sources

Public: commit cb7d6a2; PR #8

Also from the owner's working notes and conversations (not published): owner conversation, 2026-11-24; decisions/architecture.md:193; decisions/scope.md:43; backlog/slm-tickets-draft.md:95-103
