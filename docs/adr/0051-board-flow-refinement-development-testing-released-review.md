# 0051. Board flow: Refinement → In Development → In Testing → Released; review on GitHub only

- **Status:** Accepted (supersedes [0050](0050-board-review-column-architecture-review.md))
- **Date:** 2026-11-24
- **Area:** process
- **Deciders:** Ahmed Oraby (owner)

## Context

The board should stay simple but show that testing and code review happen.

> Ahmed Oraby: «يبقى في تيستنج بيحصل بشكل او باخر»

## Options considered

| Option | For | Against |
|---|---|---|
| **Four SLM-only statuses; architecture review as a GitHub reviewer, not a stage** | simple, with testing visible | review not visible on the board |
| Three stages To Do/In Progress/Done | simplest | no testing step |
| Copy the full flow of another project | proven | too heavy for 3 days |

## Decision

- Statuses: Refinement → In Development → In Testing → Released (moves allowed from any status).
- Architecture reviews the PR on GitHub only.
- QA tests in In Testing.

## Consequences

- The issue-close automation targets Released (ADR 0023).

## Sources

Public: docs/decisions.md

Also from the owner's working notes and conversations (not published): owner conversation, 2026-11-24; handover notes; owner conversation, 2026-11-25; Confluence page 19365889; Confluence page 19267692
