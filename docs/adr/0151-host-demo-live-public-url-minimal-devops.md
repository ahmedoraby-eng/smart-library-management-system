# 0151. Host the demo live with a public URL; minimal DevOps, one environment

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** infra
- **Deciders:** Ahmed Oraby (owner)

## Context

The demo first ran only locally; reviewers need a live link.

> Ahmed Oraby: «ليه مش مقومينه على سواء على هنا على كلود او على الافضل على كلاود فلير»

## Options considered

| Option | For | Against |
|---|---|---|
| **One production environment on free hosting + local + CI container** | demo-sized | no staging |
| Neon branch per PR | isolated previews | more setup |
| Kubernetes, complex IaC | enterprise look | far too heavy |

## Decision

- Deploy to Cloudflare with a public URL, persistent database, health check and basic CI/CD.
- One production environment; local Postgres; a CI service container; no staging.
- No Kubernetes, complex IaC or paid managed services.

## Consequences

- A bad deploy is fixed by a Workers version rollback.

## Sources

owner conversation, 2026-11-24; master prompt; decisions/infra.md:28
