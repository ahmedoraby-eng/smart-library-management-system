# 0166. Inventory invariant checked by a property test and by raw SQL against the CHECK

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** testing
- **Deciders:** QA

## Context

The invariant `0 ≤ available ≤ total` must hold under any sequence.

## Options considered

| Option | For | Against |
|---|---|---|
| **fast-check + raw SQL** | covers paths no one thought of | random tests need seeds to debug |

## Decision

- fast-check runs 200 random sequences of borrow, return and total edits across 3 books, asserting `0 ≤ available ≤ total` and `available = total − open loans`.
- Raw UPDATEs setting available to −1 or total + 1 must be rejected by the CHECK.

## Consequences

- The database stays the last line of defence.

## Sources

Public: api/test/

Also from the owner's working notes and conversations (not published): decisions/test-strategy.md:37-38; decisions/test-strategy.md:41
