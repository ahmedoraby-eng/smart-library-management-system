# 0074. Real separation of concerns; no all-in-one backend-as-a-service

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** architecture
- **Deciders:** Ahmed Oraby (owner)

## Context

The design must show clear layers that can be defended in the interview.

> Ahmed Oraby: «لازم تكون فيها السيبريشن اوف كونسيرن... مش عايز... سوبا بيز وحاجات... جاهزه»

## Options considered

| Option | For | Against |
|---|---|---|
| **Own API with explicit layers on plain services** | separation is visible and testable | more code than a BaaS |
| Supabase/Firebase-style BaaS | fast to start | hides the layers the assessment wants to see |

## Decision

- Real layers (api / application / domain / infrastructure).
- No all-in-one BaaS such as Supabase, Firebase or Appwrite; managed services are used only as plain infrastructure behind our interfaces.

## Consequences

- Layers are enforced in CI (ADR 0004).

## Sources

owner conversation, 2026-11-24; decisions/architecture.md:4,85-93
