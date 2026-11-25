# 0085. Stack v1: Kotlin/Ktor + Postgres on Cloud Run, Firebase Auth, Claude Haiku

- **Status:** Superseded by [0003](0003-cloudflare-d1-database.md)
- **Date:** 2026-11-24
- **Area:** architecture
- **Deciders:** Architecture

## Context

The first architecture draft followed the master prompt's Kotlin suggestion, close to Java.

## Options considered

| Option | For | Against |
|---|---|---|
| **Kotlin + Ktor 3 + Exposed + Flyway, Postgres, React SPA, Cloud Run + Neon, Firebase Auth, Claude Haiku** | close to Java; Postgres features | JVM cold start; paid AI; free JVM hosts sleep |
| Spring Boot | most familiar | heavier |

## Decision

One container serving API + SPA on Cloud Run, Neon Postgres, Firebase Auth (Google) for authentication only with roles in our DB, and Claude Haiku for AI ranking.

## Consequences

- Replaced the same day by an all-Cloudflare TypeScript draft (ADR 0003), then by ADR 0002.

## Sources

owner conversation, 2026-11-24; design notes; decisions/architecture.md:8,395-403
