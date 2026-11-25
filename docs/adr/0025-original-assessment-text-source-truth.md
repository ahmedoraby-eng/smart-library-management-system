# 0025. The original assessment text is the source of truth

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** scope
- **Deciders:** Ahmed Oraby (owner)

## Context

A long master prompt was written to drive the work, but it adds roles and ideas that are not in the assessment.

## Options considered

| Option | For | Against |
|---|---|---|
| **Trace every requirement to the original assessment text** | no invented requirements | the prompt's extras need their own reason |

## Decision

- `original-assessment.md` (transcribed from the owner's screenshot) is the target; the master prompt only serves it.
- Where the prompt's team roles differ from the real team, the real team wins.
- The owner's later rulings override the prompt.

## Consequences

- The traceability matrix quotes the assessment rows first.
- Anything not in the assessment is marked as ours.

## Sources

Public: README.md

Also from the owner's working notes and conversations (not published): original-assessment.md:1; master prompt; owner conversation, 2026-11-24
