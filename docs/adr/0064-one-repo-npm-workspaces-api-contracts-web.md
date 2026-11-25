# 0064. One repo with npm workspaces: api, contracts, web

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

One public repo with npm workspaces `contracts`, `api` and `web`; `e2e/`, `migrations/` and `seed/` are plain folders.

## Consequences

- One PR can change API, contract and UI together.

## Sources

Public: docs/decisions.md

Also from the owner's working notes and conversations (not published): decisions/engineering-plan.md:12,36-54
