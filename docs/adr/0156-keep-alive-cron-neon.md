# 0156. No keep-alive cron for Neon

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** infra
- **Deciders:** DevOps

## Context

Neon free sleeps after idle; keeping it awake uses free compute hours.

## Options considered

| Option | For | Against |
|---|---|---|
| **Let it sleep; warm up by hand before the demo** | stays inside free hours | first query after idle waits under 1 s |
| Keep-alive cron | no cold start | burns free compute |

## Decision

No keep-alive job. The nightly cron wakes it anyway; open the app once before recording.

## Consequences

- Revisit if cold starts hurt real use.

## Sources

decisions/infra.md:45; decisions/architecture.md:344
