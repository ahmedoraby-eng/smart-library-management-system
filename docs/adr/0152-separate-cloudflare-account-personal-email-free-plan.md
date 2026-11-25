# 0152. A separate Cloudflare account on a personal email, free plan

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** infra
- **Deciders:** DevOps

## Context

The employer's Cloudflare account must stay untouched and its name hidden.

## Options considered

| Option | For | Against |
|---|---|---|
| **New account 'Smart Library', Workers subdomain `ahmedoraby`** | no employer name; isolated | one more account |

## Decision

New Cloudflare account on the owner's personal email, free plan, named 'Smart Library', Workers subdomain `ahmedoraby`; no Zero Trust needed.

## Consequences

- All bindings and secrets live in this account.

## Sources

Public: docs/architecture.md

Also from the owner's working notes and conversations (not published): decisions/infra.md:9,79; engagement notes; handover notes
