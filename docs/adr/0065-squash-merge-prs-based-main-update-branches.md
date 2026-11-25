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

- Every PR from #2 on is squash-merged into main (#1 was a merge commit).
- New PRs are based on main, not on another branch; stacked work must be landed on main explicitly.
- Branches are updated by merging origin/main; no force push.
- Branch protection isn't available on the plan, so this is a team rule, not enforced by GitHub.

## Consequences

- A stacked set (#2–#4) had to be re-landed on main in PR #6.

## Notes

**Amended by [0185](0185-qa-tests-pr-before-merge.md)** (in force since 2026-11-25): rulesets are free on a public repository, so a `protect-main` ruleset enforces squash-only merges, required checks (including `Jira status`) and no bypass. The line above about branch protection was wrong for a public repository.

## Sources

Public: docs/decisions.md

Also from the owner's working notes and conversations (not published): owner conversation, 2026-11-24; Confluence page 19333121; Confluence page 19365889
