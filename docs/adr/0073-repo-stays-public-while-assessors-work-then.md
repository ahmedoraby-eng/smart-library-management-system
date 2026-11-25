# 0073. Repo stays public while assessors work, then becomes private

- **Status:** Accepted
- **Date:** 2026-11-25
- **Area:** repo
- **Deciders:** Ahmed Oraby (owner)

## Context

A naming issue was found late, and the reviewers are unknown, so flipping visibility now could break their access.

> Ahmed Oraby: «بابليك وكل حاجة. آه، و ولما بعد ما الناس تخلص assessment وكده نحوله private»

## Options considered

| Option | For | Against |
|---|---|---|
| **Keep public until the assessment ends, then make private** | reviewers keep access | the repo stays public for some days |
| Make private now | hides it at once | may block reviewers |

## Decision

Keep the repo public as is while assessors review; send the work by email; make it private afterwards.

## Consequences

- A reminder is needed after the assessment.

## Sources

Public: docs/decisions.md

Also from the owner's working notes and conversations (not published): owner conversation, 2026-11-25
