# 0123. 'Low' availability means exactly one copy left

- **Status:** Accepted (supersedes [0124](0124-low-availability-25-copies-less.md))
- **Date:** 2026-11-24
- **Area:** ux
- **Deciders:** UX

## Context

The meaningful moment for a librarian is the last copy.

## Options considered

| Option | For | Against |
|---|---|---|
| **Available ≥ 2, Low = 1, Unavailable = 0** | no magic number to defend | ignores very large stocks |
| Percentage threshold | scales with stock | arbitrary |

## Decision

- Available ≥ 2 (success), Low = 1 (amber), Unavailable = 0 (danger, plus 'Next copy due back <date>').

## Consequences

- An earlier note used 'Low = 25 % or less'.

## Sources

Public: web/src/

Also from the owner's working notes and conversations (not published): decisions/ux.md:19,122-124; Confluence page 19169290
