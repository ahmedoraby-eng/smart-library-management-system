# 0124. 'Low' availability at 25 % of copies or less

- **Status:** Superseded by [0123](0123-low-availability-means-exactly-one-copy-left.md)
- **Date:** 2026-11-24
- **Area:** ux
- **Deciders:** UX

## Context

The first UX notes defined Low as a share of total copies.

## Options considered

| Option | For | Against |
|---|---|---|
| **Low ≤ 25 % of copies** | scales with stock | an arbitrary percentage |

## Decision

Badges Available / Low / Unavailable with counts; Low = 25 % or less of copies; 'Popular' = most loans in the last 30 days.

## Consequences

- Replaced by 'Low = exactly 1 copy'.

## Sources

Public: web/src/

Also from the owner's working notes and conversations (not published): owner conversation, 2026-11-24
