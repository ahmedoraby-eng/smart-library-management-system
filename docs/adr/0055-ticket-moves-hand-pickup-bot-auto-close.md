# 0055. Ticket moves by hand; no pickup bot or auto-close at first

- **Status:** Superseded by [0023](0023-close-on-merge-after-deploy.md)
- **Date:** 2026-11-24
- **Area:** process
- **Deciders:** Coordination, approved by Ahmed Oraby

## Context

The build was short and work ran ahead of the board.

## Options considered

| Option | For | Against |
|---|---|---|
| **Manual transitions** | no setup | the board lagged the work |
| Auto-close on merge as in other projects | board stays current | setup time |

## Decision

Engineering starts each ticket by hand; 'Closes SLM-n' documents intent but moves nothing; every move after In Development is manual.

## Consequences

- Replaced on 25/11 by close-on-merge gated on the deploy check (ADR 0023). Pickup automation was never enabled.

## Sources

Public: docs/decisions.md

Also from the owner's working notes and conversations (not published): Confluence page 19365889
