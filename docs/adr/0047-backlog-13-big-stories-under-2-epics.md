# 0047. Backlog: 13 big stories under 2 epics, P0–P3 mapped to Jira priority

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** process
- **Deciders:** Product owner, approved by Ahmed Oraby

## Context

The backlog should prove the idea, not mirror a full product.

> Ahmed Oraby: «Yes, create it»

## Options considered

| Option | For | Against |
|---|---|---|
| **10–15 big tickets with Given/When/Then ACs** | readable, demo-sized | coarse tracking |

## Decision

- 13 stories under Epic E1 (assessment minimum, SLM-14) and Epic E2 (differentiators, SLM-15).
- Tiers: P0 → Highest (book CRUD, borrow, return, search, persistence, README), P1 → High (auth, RBAC, SSO, deploy), P2 → Medium (AI, dashboard, overdue), P3 → Low.
- Never sacrifice P0 for P2/P3; optional ACs tagged P2/P3 are cut first.
- Full ACs live only in the tickets draft, so copies can't drift.

## Consequences

- Later additions (hybrid search SLM-16) follow the same shape.

## Sources

Public: docs/decisions.md

Also from the owner's working notes and conversations (not published): backlog/slm-tickets-draft.md:3,12-15; owner conversation, 2026-11-24; decisions/scope.md:16-34,69; backlog/slm-tickets-draft.md:10-12,41-47; master prompt; backlog/slm-tickets-draft.md:11; decisions/scope.md:6
