# 0053. Minor UI changes take the polishing route: UX quick look, no architecture review

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** process
- **Deciders:** UX, approved by Ahmed Oraby

## Context

Small visual tweaks don't need a full review round.

## Options considered

| Option | For | Against |
|---|---|---|
| **UX quick look only for minor changes** | fast | a minor change could hide a real issue |

## Decision

- Minor changes (e.g. the reindex progress bar) get a UX quick look: reply OK or tweaks.
- No architecture review for them.
- UX runs full UI passes (11 screens, both themes, 3 widths) before the demo recording.

## Consequences

- Anything touching logic, security or data still gets architecture review.

## Sources

Public: PR #18

Also from the owner's working notes and conversations (not published): design notes
