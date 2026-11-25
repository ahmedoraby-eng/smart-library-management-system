# 0108. Lexical query normalisation: letters and digits, ≥ 3 chars, no stop words, ≤ 12 terms

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** ai
- **Deciders:** Architecture

## Context

Raw input can break tsquery and adds noise to ranking.

## Options considered

| Option | For | Against |
|---|---|---|
| **`queryTerms`: lower-case, `\p{L}\p{N}` words of ≥ 3 chars, 35-word stop list, dedupe, cap 12** | safe tsquery; focused terms | very short words are lost |

## Decision

`queryTerms` lower-cases the request, keeps only letter/digit words of at least 3 characters, removes a 35-word stop list, removes duplicates and keeps at most 12 terms. Ranking uses `ts_rank_cd` plus trigram `word_similarity > 0.5` on title and author.

## Consequences

- This protects the SQL, not the model; the model is guarded by the validator.

## Sources

Public: docs/ai.md

Also from the owner's working notes and conversations (not published): Confluence page 19169328; owner conversation, 2026-11-24; owner conversation, 2026-11-25
