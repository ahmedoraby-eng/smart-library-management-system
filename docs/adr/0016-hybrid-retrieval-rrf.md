# 0016. Hybrid retrieval: full-text + vector, fused with RRF (k = 60), similarity threshold 0.72

- **Status:** Accepted
- **Date:** 2026-11-25
- **Deciders:** Ahmed Oraby (owner), architecture review

## Context

Full-text alone ([0015](0015-full-text-only-retrieval.md)) misses synonym-only matches. The two retrievers' scores are on different scales.

## Options considered

| Option | For | Against |
|---|---|---|
| Vector only | semantic recall | loses exact titles, authors and typos |
| Weighted score sum | tunable | needs score normalisation across two scales |
| **Lexical and semantic in parallel, fused with Reciprocal Rank Fusion** | ranks only, so no score scaling; each retriever covers the other's blind spot | two retrievers to run and test |

## Decision

- `HybridCatalogRetrieval` runs two retrievers in parallel:
  - full-text + trigram (top 20);
  - vector search (bge-base, 1.5 s budget).
- **Fusion:** `score = Σ 1/(60 + rank)`. Ties go to the better full-text rank, and the best 20 are kept. Each candidate records `foundBy`: `lexical`, `semantic`, `both` or `related`.
- **Threshold:** semantic hits below `EMBEDDING_MIN_SIMILARITY` = **0.72** are dropped.
  - Why: bge-base cosines sit high, and unrelated texts often score 0.6–0.7, so the first value of 0.5 would let noise in.
  - Every request logs the top similarity (a number only), so the threshold can be tuned in config without a code change.
- **Fallback:** if embedding fails or is slow, retrieval is full-text only (`retrieval: "lexical"`).

## Consequences

- The threshold can't be calibrated locally, because the local embedder is a fake. It is checked on the deployed Worker.
- Everything after retrieval (ranker, validator, fallback) is unchanged.
