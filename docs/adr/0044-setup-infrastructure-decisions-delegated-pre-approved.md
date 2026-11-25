# 0044. Setup and infrastructure decisions are delegated and pre-approved

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** process
- **Deciders:** Ahmed Oraby (owner)

## Context

Waiting on the owner for each setup step would block a 3-day build.

> Ahmed Oraby: «خدوا اي قرارات انا موافق عليها كلها»

## Options considered

| Option | For | Against |
|---|---|---|
| **Team takes infra and setup decisions; owner pre-approves them** | no waiting | owner sees choices after the fact |

## Decision

- The owner approves in advance the team's infra decisions: hosting, database, domain, CI/CD, auth setup, repo name.
- Coordination creates the Jira project and accounts, and asks the owner only for what an agent can't do (sign-ins).
- Existing accounts may be reused if no employer name shows; a new domain is allowed.

## Consequences

- Decisions are recorded so the owner can review them.

## Sources

Public: docs/decisions.md

Also from the owner's working notes and conversations (not published): owner conversation, 2026-11-24; handover notes; engagement notes
