# 0063. Seed commit pushed once by the owner from a clean folder

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** repo
- **Deciders:** Ahmed Oraby (owner)

## Context

Agent identities can't push to main or push workflow files; the first commit needs both.

## Options considered

| Option | For | Against |
|---|---|---|
| **Owner pushes the seed (README, LICENSE, .gitignore, hygiene CI) from a separate folder** | doesn't overwrite engineering's clone | one manual step |

## Decision

- The seed is pushed once from a separate bootstrap folder, not from engineering's working clone.
- After that, agents push `<agent>/SLM-n-slug` branches and open PRs against main.

## Consequences

- Engineering rebased on the seed and merged its CI file with the seed's.

## Sources

Public: docs/decisions.md

Also from the owner's working notes and conversations (not published): owner conversation, 2026-11-24; repo-seed/BOOTSTRAP.md:1-10
