# 0065. Squash-merge only; PRs based on main; update branches by merging main

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** repo
- **Deciders:** Ahmed Oraby (owner)

## Context

Main should read as one commit per story.

> Ahmed Oraby: «Yes, squash only»

## Options considered

| Option | For | Against |
|---|---|---|
| **Squash merge only** | clean history | branch commits are lost on main |
| Merge commits | full history | noisy main |
| Stacked PRs | parallel work | stacked branches landed in the wrong place once |

## Decision

- Every PR is squash-merged into main.
- New PRs are based on main, not on another branch; stacked work must be landed on main explicitly.
- Branches are updated by merging origin/main; no force push.
- Branch protection isn't available on the plan, so this is a team rule, not enforced by GitHub.

## Consequences

- A stacked set (#2–#4) had to be re-landed on main in PR #6.

## Sources

owner conversation, 2026-11-24; Confluence page 19333121; Confluence page 19365889
