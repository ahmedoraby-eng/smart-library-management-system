# 0183. Three documented demo queries show lexical, semantic and both

- **Status:** Accepted
- **Date:** 2026-11-25
- **Area:** demo
- **Deciders:** Engineering, architecture review

## Context

Assessors should see each retrieval path work on the seed.

## Options considered

| Option | For | Against |
|---|---|---|
| **Fixed queries with expected `foundBy`** | repeatable demo | must be re-checked on the real model |

## Decision

- 'Daniel Kahnemann' (author typo) → lexical: Thinking, Fast and Slow.
- 'a book for someone who is losing a parent' → semantic: H Is for Hawk, Crying in H Mart.
- 'a memoir about grief and mourning' → both: A Grief Observed.
- Verified with the fake embedder; must be re-checked on the deployed Worker.

## Consequences

- Seed wording keeps the semantic case semantic (seed descriptions ADR).

## Sources

docs/ai.md; commit c8099f7
