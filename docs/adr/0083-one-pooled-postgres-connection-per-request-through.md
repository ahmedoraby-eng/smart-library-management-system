# 0083. One pooled Postgres connection per request through Hyperdrive

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** architecture
- **Deciders:** Architecture

## Context

Workers can't hold long-lived connections; a transaction needs one connection for its length.

## Options considered

| Option | For | Against |
|---|---|---|
| **Open one connection per request, close in `waitUntil`** | fits Workers; transactions are safe | per-request connect cost (pooled by Hyperdrive) |

## Decision

- Each request opens one pg connection from Hyperdrive and closes it in `waitUntil`.
- A borrow or return transaction holds that connection for its length.
- The browser calls `/api` on the same origin with the session cookie; the request id is returned as `x-request-id`.

## Consequences

- Long background jobs don't fit this model; they run in small batches.

## Sources

decisions/architecture.md:217; Confluence page 19365918; Jira SLM-6
