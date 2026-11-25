# 0016. Hybrid retrieval: full-text + vector, fused with RRF (k = 60), similarity threshold 0.72

- **Status:** Accepted (supersedes [0015](0015-full-text-only-retrieval.md), [0109](0109-semantic-similarity-threshold-hard-coded-0-5.md))
- **Date:** 2026-11-25
- **Area:** ai
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

## Notes

The semantic side embeds the query and takes the top 40 chunks, best chunk per book. If embeddings fail but quota and budget remain, the model still ranks the lexical candidates: embedding failure is an availability signal, not a cost signal. Related-category top-up (fixed score 0.001) runs only when fewer than 5 candidates are fused. Calibration set: the three memoir queries plus three unrelated ones (quantum chromodynamics, tax law for shipping companies, knitting patterns); keep the highest value where memoirs stay semantic and each unrelated query gets at most 2 semantic hits. The UI shows a small 'Found by meaning' note.

> Ahmed Oraby: «يبقى عندنا هايبرد سيرش. يبقى ده هيبقى شوكيس كويس، خصوصا ان البوزيشن اللي احنا بنقدم عليه ده AI Engineering Manager»

## Sources

Public: docs/ai.md; PR #19; commit c8099f7

Also from the owner's working notes and conversations (not published): owner conversation, 2026-11-24; Jira SLM-16; Confluence page 19169328; design notes; Confluence page 19398657
