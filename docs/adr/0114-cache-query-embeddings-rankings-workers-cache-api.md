# 0114. Cache query embeddings and rankings in the Workers Cache API

- **Status:** Superseded by [0019](0019-ai-cost-tiers-and-quotas.md)
- **Date:** 2026-11-24
- **Area:** cost
- **Deciders:** Architecture

## Context

The hybrid-search ticket first planned caching with the Workers Cache API.

## Options considered

| Option | For | Against |
|---|---|---|
| **Workers Cache API, ~15 minutes** | no table | is a no-op on `*.workers.dev` |

## Decision

Cache the query embedding and ranked ids for about 15 minutes in the Workers Cache API, never when a member is selected.

## Consequences

- Replaced: caches live in Postgres `ai_cache` (ADR 0019).

## Sources

Jira SLM-16; Confluence page 19464205
