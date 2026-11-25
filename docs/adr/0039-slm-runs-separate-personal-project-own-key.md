# 0039. SLM runs as a separate personal project with its own key, files and sessions

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** process
- **Deciders:** Ahmed Oraby (owner)

## Context

The owner runs other work with the same tooling. Mixing keys, files or tickets would break separation of concerns.

> Ahmed Oraby: «وعشان بس سيبريشن اوف كونسيرن، وعشان ما نلخبطش الشغل ده مع الشغل التاني، ممكن تعملي سيشن تانية منفصلة»

## Options considered

| Option | For | Against |
|---|---|---|
| **Separate project: own key SLM, own folder, own sessions; same team reused** | clean separation, no new team to build | needs discipline on keys |
| Build a second dedicated team | full isolation | no time |

## Decision

- Jira key `SLM` on every ticket, branch and commit.
- All work stays in the SLM repo and its own work folder; no keys, files or tickets from other projects.
- Its own coordination session and lead sessions.

## Consequences

- Costs are tracked in their own category (see the cost category ADR).

## Sources

Public: docs/decisions.md

Also from the owner's working notes and conversations (not published): owner conversation, 2026-11-24; engagement notes
