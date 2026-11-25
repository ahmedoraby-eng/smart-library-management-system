# 0054. Coordination resolves conflicts and squash-merges PRs on the owner's behalf

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** process
- **Deciders:** Ahmed Oraby (owner)

## Context

The owner can't watch every PR, and agent identities can't merge as him through the CLI.

> Ahmed Oraby: «حل الكونفليكت واعملي ميرج انت بالنيابه عني»

## Options considered

| Option | For | Against |
|---|---|---|
| **Coordination merges after approval and green CI** | work keeps flowing | merges happen without the owner watching |

## Decision

- Coordination resolves merge conflicts and squash-merges after architecture approval and green CI (plus UX for UI changes).
- Pushing workflow files and closing PRs stay with the owner.

## Consequences

- Each merge is reported to the owner.

## Sources

Public: docs/decisions.md

Also from the owner's working notes and conversations (not published): owner conversation, 2026-11-24; handover notes
