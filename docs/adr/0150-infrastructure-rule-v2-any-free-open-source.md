# 0150. Infrastructure rule v2: any free or open-source service; Postgres preferred

- **Status:** Accepted (supersedes [0149](0149-infrastructure-rule-v1-use-cloudflare-github-jira.md))
- **Date:** 2026-11-24
- **Area:** infra
- **Deciders:** Ahmed Oraby (owner)

## Context

The Cloudflare-only rule forced D1, which has no interactive transactions.

> Ahmed Oraby: «ممكن نستخدم حاجه اوبن سورس تكون مفتوحه او فري... الافضل تكون طبعا بوست جريس سيكوال مثلا»

## Options considered

| Option | For | Against |
|---|---|---|
| **Any free, defensible option; prefer what's already available if easy** | the architect can pick the best fit | more vendors |
| Keep Cloudflare-only | fewer vendors | D1 limits |

## Decision

Cloudflare isn't mandatory. Prefer existing tools when easy, otherwise any free or open-source tool; Postgres (or something light) preferred for the database.

## Consequences

- Led to Neon Postgres via Hyperdrive (ADR 0002).

## Sources

Public: docs/architecture.md

Also from the owner's working notes and conversations (not published): owner conversation, 2026-11-24; decisions/architecture.md:10,30
