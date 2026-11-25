# 0031. If Google SSO is late, ship demo-account sign-in with the same RBAC, never no auth

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** scope
- **Deciders:** Product owner, architecture review

## Context

SSO is a stretch item. The app must never fall back to having no authentication.

## Options considered

| Option | For | Against |
|---|---|---|
| **Demo-account sign-in with the same RBAC first, Google after** | secure from day one | SSO may arrive later |

## Decision

- If Google SSO threatens the timeline, ship demo-account sign-in with the same roles and checks first.
- Record the fallback in the scope notes if used.
- There is never a no-auth mode.

## Consequences

- Google sign-in was built behind config and could ship later without changing RBAC.

## Sources

decisions/scope.md:35; decisions/engineering-plan.md:185; Jira SLM-8; master prompt; backlog/slm-tickets-draft.md:143
