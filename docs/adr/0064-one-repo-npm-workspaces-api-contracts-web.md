# 0064. One repo with npm workspaces: api, contracts, web, e2e, migrations, seed

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** repo
- **Deciders:** Engineering, architecture review

## Context

API and UI share types and contracts.

## Options considered

| Option | For | Against |
|---|---|---|
| **Single repo, npm workspaces** | shared contracts, one CI | everything versions together |

## Decision

One public repo with workspaces `api`, `contracts`, `web`, `e2e`, `migrations` and `seed`.

## Consequences

- One PR can change API, contract and UI together.

## Sources

decisions/engineering-plan.md:12,36-54
