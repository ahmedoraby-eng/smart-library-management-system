# 0117. Borrow and Return live together under Circulation, as two tabs

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** ux
- **Deciders:** UX

## Context

Both are desk tasks done many times a day.

## Options considered

| Option | For | Against |
|---|---|---|
| **One nav item, two tabs** | one place per desk task | one extra click to the second tab |

## Decision

`/circulation/borrow` and `/circulation/return`; `/circulation` redirects to Borrow. Borrow is hidden for Supervisors.

## Consequences

- Member and book pages also offer prefilled entry points.

## Sources

decisions/ux.md:12; Confluence page 19169290; PR #8; commit cb7d6a2
