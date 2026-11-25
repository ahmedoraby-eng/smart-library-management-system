# 0067. Workflow-file changes are pushed by the owner

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** repo
- **Deciders:** DevOps

## Context

The agents' GitHub Apps have no Workflows permission.

## Options considered

| Option | For | Against |
|---|---|---|
| **DevOps prepares a script or patch; the owner applies it** | no extra permission for agents | an owner step per CI change |
| Give an agent identity workflow permission | no owner step | widens what agents can change |

## Decision

- Any change under `.github/workflows/` is delivered as a script or patch the owner runs.
- Workflow-only PRs are opened separately.
- Nothing is written through the owner's own account by agents.

## Consequences

- CI changes take longer to land.

## Sources

Public: docs/decisions.md

Also from the owner's working notes and conversations (not published): decisions/infra.md:72; decisions/engineering-plan.md:175; design notes; owner conversation, 2026-11-24; owner conversation, 2026-11-25
