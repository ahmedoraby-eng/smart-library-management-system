# 0092. Demo seed: about 60 real books in 8 categories, 25 fictional members, loans in every state

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** data
- **Deciders:** Product owner, architecture review

## Context

Reviewers need a living library on first open.

## Options considered

| Option | For | Against |
|---|---|---|
| **Separate `seed/demo.sql`, dates relative to now()** | realistic and repeatable | tied to the demo |

## Decision

- About 60 real books (later 64) with public metadata, 8 categories, 25 fictional members, ACTIVE/OVERDUE/RETURNED loans with dates relative to `now()`.
- Seed is separate from migrations and loads only into an empty catalogue; reseed wipes and reloads.
- Demo sign-in accounts come from config, never from the seed. Tests never depend on the seed.

## Consequences

- The nightly reset reloads this seed (ADR 0012).

## Sources

Public: commit da20579

Also from the owner's working notes and conversations (not published): decisions/architecture.md:338; decisions/engineering-plan.md:50; Jira SLM-6; Confluence page 19398657; design notes; backlog/slm-tickets-draft.md:51-59
