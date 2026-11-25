# 0163. CI Postgres image `pgvector/pgvector:pg16` so the HNSW path is tested

- **Status:** Accepted (2026-11-25, by Ahmed Oraby)
- **Date:** 2026-11-25
- **Area:** cicd
- **Deciders:** Architecture, approved by Ahmed Oraby

## Context

> Ahmed Oraby, 2026-11-25: «موافق طبعا على القرار بتاع البي جي فيكتور ده»

CI uses plain `postgres:16`, so migration 0004's pgvector branch runs only on Neon.

## Options considered

| Option | For | Against |
|---|---|---|
| **Switch the CI service image (one line)** | HNSW path tested before production | slightly larger image |
| Keep postgres:16 with brute force only | nothing to change | HNSW proven only in production |

## Decision

Change the CI service image to `pgvector/pgvector:pg16`. Approved by architecture on 25/11; waiting for the owner to push the workflow change.

## Consequences

- Closes the gap noted in ADR 0018.

## Sources

design notes; .github/workflows/ci.yml on origin/main
