# 0155. Health endpoints: liveness without the database; `?deep=1` checks it, rate-limited

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** infra
- **Deciders:** DevOps

## Context

Smoke checks need a cheap public liveness probe and a deeper check that can't be abused.

## Options considered

| Option | For | Against |
|---|---|---|
| **Two levels on one endpoint** | cheap public probe | deep check is limited |

## Decision

`GET /api/health` is public liveness with no DB call; `?deep=1` runs `SELECT 1` (and reports the vector path) and is rate-limited 10/min. The deploy smoke expects `200 {status: ok, db: ok}`.

## Consequences

- Known nit: today the database connection opens before the limit check (see [0103](0103-rate-limiting.md)).

## Sources

Public: docs/architecture.md

Also from the owner's working notes and conversations (not published): decisions/infra.md:27,74; decisions/engineering-plan.md:107-109
