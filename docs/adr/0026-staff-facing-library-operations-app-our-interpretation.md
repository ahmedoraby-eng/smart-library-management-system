# 0026. Staff-facing library operations app (our interpretation)

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** scope
- **Deciders:** Product owner, approved by Ahmed Oraby

## Context

The assessment doesn't say if the app is for staff or for the public. Every minimum feature is an operator action.

## Options considered

| Option | For | Against |
|---|---|---|
| **Staff-facing operations tool: Admin, Librarian and Supervisor sign in** | fits the 'authorized staff' wording; small scope | no member self-service |
| Customer-facing portal | members can serve themselves | more screens, accounts and rules |

## Decision

- The app is a staff-facing library operations system, not a marketplace or member portal.
- Members are patrons only; there are no fees, fines or payments.
- The README states this as **our interpretation**, never as an interviewer requirement.

## Consequences

- Member login, holds and notifications stay out of scope.
- Revisit if a member portal is ever asked for.

## Sources

decisions/scope.md:5,8-9; owner conversation, 2026-11-24; master prompt; README.md on origin/main; docs/architecture.md key decisions; Confluence page 19267692; Jira SLM-3; Jira SLM-5; Jira SLM-6; repo-seed/README.md:3
