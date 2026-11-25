# 0140. Edit conflict (STALE_VERSION) shows a notice with Reload

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** ux
- **Deciders:** UX

## Context

Two librarians can edit the same book.

## Options considered

| Option | For | Against |
|---|---|---|
| **Danger notice + [Reload]; changes not saved** | no silent overwrite | the user re-types the change |

## Decision

`409 STALE_VERSION` shows 'Someone else changed this book…' with [Reload]; nothing is saved.

## Consequences

- Same pattern for members.

## Sources

Public: web/src/

Also from the owner's working notes and conversations (not published): decisions/ux.md:188
