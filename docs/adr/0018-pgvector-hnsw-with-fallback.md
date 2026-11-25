# 0018. pgvector HNSW in production, with a `real[]` brute-force fallback

- **Status:** Accepted
- **Date:** 2026-11-25
- **Deciders:** Ahmed Oraby (owner), architecture review

## Context

Neon has pgvector. CI (`postgres:16`), docker-compose and the embedded Postgres used for local runs and e2e don't. The catalogue is demo-sized.

## Options considered

| Option | For | Against |
|---|---|---|
| pgvector everywhere | one code path | every dev and CI image must carry the extension |
| No pgvector, scan in the app | works everywhere | slow at scale |
| **Conditional: `vector(768)` + HNSW (cosine) where available; `real[]` scan otherwise** | fast in production, runs anywhere | two query paths |

## Decision

- Migration `0004_book_chunks.sql` always creates `embedding real[]`.
- Where the extension is available, a `DO` block adds `embedding_v vector(768)` and an index `USING hnsw (embedding_v vector_cosine_ops)`.
- The adapter checks once which path applies, and logs it once per isolate.
- `/api/health?deep=1` reports `vector: "hnsw" | "brute-force" | "off"`, so production can't sit on brute force unnoticed.
- With pgvector, only the `vector` column is written.

## Consequences

- The HNSW SQL path is proven only on Neon until CI uses a `pgvector/pgvector:pg16` image (a recommended follow-up).
- Brute force is acceptable for a few hundred chunks only.
