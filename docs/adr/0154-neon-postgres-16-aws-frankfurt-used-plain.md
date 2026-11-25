# 0154. Neon Postgres 16 in AWS Frankfurt, used as plain Postgres

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** infra
- **Deciders:** Architecture, approved by Ahmed Oraby

## Context

The database needs real transactions, a free tier that doesn't pause for days, and a region near Egypt.

> Ahmed Oraby: «لو الاوبشن اللي انتوا مختارينه اللي هو سيكوال سيرفر على نيون ده كويس، خلينا نبروسيد»

## Options considered

| Option | For | Against |
|---|---|---|
| **Neon free, Frankfurt, plain Postgres only** | scales to zero, resumes in under a second | compute sleeps after idle |
| Supabase free | popular | pauses after 7 idle days |
| Turso/SQLite | cheap | no row locks, no FTS/pg_trgm; race tests are on Postgres |
| Aiven free | plain Postgres | less fit |

## Decision

- Neon project `smart-library`, Postgres 16, AWS Frankfurt (closest free region to Egypt), reached through Hyperdrive `smart-library-db`.
- No Neon Data API or Neon auth; any Postgres works by changing DATABASE_URL.
- Vars live in `wrangler.toml [vars]` because `wrangler deploy` replaces dashboard-set vars.

## Consequences

- Warm the database before recording the demo.

## Sources

Public: docs/architecture.md

Also from the owner's working notes and conversations (not published): Confluence page 19365918; Confluence page 19464205; decisions/architecture.md:337; decisions/infra.md:20,80; decisions/architecture.md:67; decisions/infra.md:20; owner conversation, 2026-11-24; design notes
