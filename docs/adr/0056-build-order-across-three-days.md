# 0056. Build order across the three days

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** process
- **Deciders:** Product owner, architecture review

## Context

Dependencies between stories decide what can run in parallel.

## Options considered

| Option | For | Against |
|---|---|---|
| **Skeleton and pipeline first, P0 next, differentiators last** | risky platform bits are proven early | polish comes late |

## Decision

- Day 1: walking skeleton + UI shell, deploy pipeline in parallel.
- Day 2: SL-01 → 03 → 02 → 04 → 05 (P0).
- Day 3: SSO → live deploy → AI discovery → dashboard → extras → submission.
- Deploy the skeleton early (Worker + Hyperdrive → Neon, demo login, deep health) to measure CPU.

## Consequences

- Until sign-in landed, a dev-only seeded staff identity filled `processedBy` (off in production).

## Sources

Public: docs/decisions.md

Also from the owner's working notes and conversations (not published): backlog/slm-tickets-draft.md:37; decisions/engineering-plan.md:138; decisions/infra.md:90-99
