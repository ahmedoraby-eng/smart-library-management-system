# 0091. Catalog search: Postgres full-text with weights, pg_trgm for typos, exact ISBN

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** data
- **Deciders:** Architecture

## Context

Search must be fast, tolerant and free, without another service.

## Options considered

| Option | For | Against |
|---|---|---|
| **Generated weighted tsvector + GIN, trigram similarity, ISBN exact match** | free, in the database | seq scan on word_similarity at large size |
| SQLite FTS5 (D1) | native to D1 | D1 dropped |
| External search engine | powerful | another service to run |

## Decision

- `books.search` generated tsvector: title A, category B, author C, description D; GIN index.
- `q` = full-text (prefix while typing) + exact ISBN + pg_trgm `word_similarity` on title and author for typos; trigram GIN on title and author.
- Terms are OR-ed (AND would return nothing for natural requests); never archived books.

## Consequences

- At a much bigger catalogue, switch to the `<%` operator so the trigram index is used.

## Sources

Public: PR #2; PR #14

Also from the owner's working notes and conversations (not published): decisions/architecture.md:117,177,228; decisions/engineering-plan.md:139; migrations 0002_search; Confluence page 19169328; Jira SLM-1; owner conversation, 2026-11-24
