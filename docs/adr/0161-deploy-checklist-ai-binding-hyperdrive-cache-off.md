# 0161. Deploy checklist: AI binding on, Hyperdrive cache off, all limiters bound, no test flags

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** cicd
- **Deciders:** Architecture

## Context

A missing binding fails silently: without `[ai]`, discovery always falls back.

## Options considered

| Option | For | Against |
|---|---|---|
| **Review `wrangler.toml` before every production deploy** | catches silent misconfig | manual review |

## Decision

- `[ai]` binding enabled; Hyperdrive id set with query cache off; every `[[ratelimits]]` binding present.
- Production vars: ENVIRONMENT=production, no AI_FAKE, AUTH_MODE or dev-header support.
- Migrations applied before deploy; smoke: `/api/health?deep=1`, demo login, one borrow/return, one discovery.

## Consequences

- `/api/health?deep=1` reports the vector path so a wrong setup shows.

## Sources

owner conversation, 2026-11-24; design notes; decisions/infra.md:74; decisions/test-strategy.md:176
