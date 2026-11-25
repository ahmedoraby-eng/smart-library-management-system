# 0090. Timestamps are timestamptz returned as ISO-8601 UTC; ids are UUIDs

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** data
- **Deciders:** Architecture

## Context

Dates cross the API and time zones.

## Options considered

| Option | For | Against |
|---|---|---|
| **timestamptz + ISO-8601 UTC** | no zone bugs | the UI formats locally |

## Decision

All timestamps are `timestamptz` and returned as ISO-8601 UTC; ids are UUIDs.

## Consequences

- The UI formats dates as 'Tue, 8 Dec 2026'.

## Sources

Public: docs/architecture.md

Also from the owner's working notes and conversations (not published): decisions/architecture.md:184,224
