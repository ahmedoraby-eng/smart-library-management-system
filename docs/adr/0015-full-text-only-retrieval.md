# 0015. Full-text-only candidate retrieval for AI discovery

- **Status:** Superseded by [0016](0016-hybrid-retrieval-rrf.md)
- **Date:** 2026-11-24
- **Area:** ai
- **Deciders:** Ahmed Oraby (owner), architecture review

## Context

The first discovery design retrieved candidates with Postgres full-text search plus trigram similarity only: no vector DB and no RAG pipeline.

## Options considered

| Option | For | Against |
|---|---|---|
| Postgres FTS + trigram | deterministic, free, no extra index | misses requests that share meaning but not words ('losing a parent' versus 'grief') |

## Decision

Retrieve the top 20 by `ts_rank_cd` on a weighted `search` vector plus trigram similarity, topped up from related categories.

## Consequences

Replaced by hybrid retrieval. Full-text stays as one of the two retrievers, and as the fallback.

## Sources

Jira SLM-9; Confluence page 19398657; design notes
