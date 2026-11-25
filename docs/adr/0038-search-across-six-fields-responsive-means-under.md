# 0038. Search across six fields; 'responsive' means under 500 ms at the API

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** scope
- **Deciders:** Product owner

## Context

The brief asks for responsive search. That needs a number to test.

## Options considered

| Option | For | Against |
|---|---|---|
| **< 500 ms at the API on the demo dataset** | testable | only on demo-sized data |

## Decision

- Case-insensitive partial search across title, author, ISBN, category, publisher and description.
- Filters for category and available-only; sort by title, author, year or recent, stable across pages.
- Search state lives in the URL; empty results offer Clear filters.
- Target < 500 ms at the API (measured 1–4 ms locally); CI soft-asserts 1 s on shared runners.

## Consequences

- A large catalogue would need a re-check of the trigram queries.

## Sources

decisions/scope.md:52; decisions/test-strategy.md:70; Jira SLM-2; backlog/slm-tickets-draft.md:84-93; PR #14
