# 0142. Loan history is read-only with filters; newest first

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** ux
- **Deciders:** UX

## Context

History is for looking up, not acting.

## Options considered

| Option | For | Against |
|---|---|---|
| **Read-only list; returns happen in Circulation or the member page** | one place to act | an extra hop to return |

## Decision

Filters: search, status, date range, processed by (Admin/Supervisor); default sort borrowed newest first.

## Consequences

- Uses the derived status (ADR 0007).

## Sources

Public: web/src/

Also from the owner's working notes and conversations (not published): decisions/ux.md:217-220
