# 0149. Infrastructure rule v1: use only Cloudflare, GitHub and Jira/Confluence

- **Status:** Superseded by [0150](0150-infrastructure-rule-v2-any-free-open-source.md)
- **Date:** 2026-11-24
- **Area:** infra
- **Deciders:** Ahmed Oraby (owner)

## Context

At kickoff the owner wanted to stay on tools already in use, lightly.

> Ahmed Oraby: «مش عايزين نستخدم حاجات كتير بعيدة عن اللي احنا استخدمناها... عندنا كلاود فلير، خلينا نستخدم كلاود فلير»

## Options considered

| Option | For | Against |
|---|---|---|
| **Cloudflare hosting, GitHub Actions, light Jira/Confluence** | known tools | no managed Postgres on Cloudflare |

## Decision

Use only what we already have: Cloudflare for hosting, GitHub (Actions), Jira/Confluence as light proof.

## Consequences

- Relaxed the same day (next ADR); it had pushed the design to D1 (ADR 0003).

## Sources

owner conversation, 2026-11-24; engagement notes
