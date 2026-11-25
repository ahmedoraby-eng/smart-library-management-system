# 0109. Semantic similarity threshold hard-coded at 0.5

- **Status:** Superseded by [0016](0016-hybrid-retrieval-rrf.md)
- **Date:** 2026-11-24
- **Area:** ai
- **Deciders:** Engineering, architecture review

## Context

The first hybrid design kept semantic hits above a fixed cosine of 0.5.

## Options considered

| Option | For | Against |
|---|---|---|
| **Fixed 0.5 in code** | simple | bge-base cosines sit high; unrelated texts score 0.6–0.7, so noise gets in |

## Decision

Semantic hits below 0.5 cosine were dropped; the value was in code.

## Consequences

- Replaced in architecture review by `EMBEDDING_MIN_SIMILARITY` = 0.72 in config, calibrated in the production smoke (ADR 0016).

## Sources

design notes; PR #19; commit c8099f7; owner conversation, 2026-11-24
