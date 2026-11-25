# 0048. Definition of Ready and Definition of Done for SLM stories

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** process
- **Deciders:** Product owner

## Context

Agents pick up and finish stories fast; the bar must be explicit.

## Options considered

| Option | For | Against |
|---|---|---|
| **Short DoR and DoD on every story** | consistent quality | a little overhead per ticket |

## Decision

- **Ready:** testable ACs, requirement ids, dependencies done or stubbed, API contract frozen, screens specified.
- **Done:** ACs covered by passing automated tests, server-side validation and authorization tested, shared error shape, RTM and README updated, UI text free of check-in/out and out-of-scope words.

## Consequences

- QA checks the Done list per ticket.

## Sources

backlog/slm-tickets-draft.md:189-193
