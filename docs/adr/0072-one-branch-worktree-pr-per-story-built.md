# 0072. One branch, worktree and PR per story, built in parallel

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** repo
- **Deciders:** Ahmed Oraby (owner)

## Context

The owner wanted a first clickable version of all main screens the same evening.

> Ahmed Oraby: «نحاول نقطع بروجرس كبير... النهارده، بحيث يبقى عندنا على الاقل... فيرست فيرجن... من اليو اي اقدر ابص عليه واشوفه»

## Options considered

| Option | For | Against |
|---|---|---|
| **Parallel engineering subagents, each on its own branch and worktree** | fast breadth | merge conflicts between stories |

## Decision

- Each story is built on its own branch and git worktree, one PR per story.
- Breadth over polish for the first draft of all screens on seed data.
- The strongest model is used for the circulation transactions.

## Consequences

- Conflicts are resolved at merge time by coordination.

## Sources

owner conversation, 2026-11-24
