# 0068. Agents reach the repo through their GitHub Apps; the architecture reviewer has no push

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** repo
- **Deciders:** DevOps

## Context

Each agent has its own GitHub App identity. A reviewer with push rights would weaken the review guard.

## Options considered

| Option | For | Against |
|---|---|---|
| **App installations per agent; reviewer not a collaborator** | review stays independent | reviewer can't fix small things himself |

## Decision

- The repo is added to each agent App installation.
- The architecture reviewer is not a collaborator and reviews without push rights, because a check fails if he can push anywhere.

## Consequences

- Reviews are comments and approvals only.

## Sources

Public: docs/decisions.md

Also from the owner's working notes and conversations (not published): engagement notes; owner conversation, 2026-11-24
