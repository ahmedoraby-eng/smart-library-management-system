# 0003. Cloudflare D1 (SQLite) as the database

- **Status:** Superseded by [0002](0002-stack-typescript-hono-workers-postgres.md)
- **Date:** 2026-11-24
- **Deciders:** Ahmed Oraby (owner), architecture review

## Context

Draft v2 put everything on Cloudflare under a "Cloudflare only" rule, so the database was D1.

## Options considered

| Option | For | Against |
|---|---|---|
| D1 | native to Workers, no connection pooling | no interactive transactions; SQLite triggers are unusual to defend |

## Decision

Use D1, with stock safety in triggers and a `CHECK`.

## Consequences

Replaced the same day. The infrastructure rule was relaxed to "any free or open-source service", and Postgres was preferred. Real transactions came back ([0006](0006-copies-as-counts-guarded-updates.md)).
