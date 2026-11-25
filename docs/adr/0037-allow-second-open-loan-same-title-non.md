# 0037. Allow a second open loan of the same title, with a non-blocking note

- **Status:** Superseded by [0036](0036-loan-rules-14-day-default-due-date.md)
- **Date:** 2026-11-24
- **Area:** scope
- **Deciders:** UX

## Context

The first UX draft treated a second copy of the same title as a soft warning.

## Options considered

| Option | For | Against |
|---|---|---|
| **Allow with a non-blocking note** | flexible for families or classes | more open loans per title per member |

## Decision

A member could borrow a second copy of a title they already have, with a note.

## Consequences

- Replaced the same day: one open loan per member and title, enforced by a partial unique index.

## Sources

Public: README.md

Also from the owner's working notes and conversations (not published): owner conversation, 2026-11-24
