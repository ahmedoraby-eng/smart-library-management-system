# 0110. Index sync: inline on save, after reset, Admin reindex, hourly top-up at :05 in 8-book batches

- **Status:** Accepted (supersedes [0111](0111-index-top-up-cron-every-15-minutes.md))
- **Date:** 2026-11-25
- **Area:** ai
- **Deciders:** Ahmed Oraby (owner), architecture review

## Context

Book text changes must reach the vector index without a Cloudflare token in scripts, inside the 10 ms CPU limit.

## Options considered

| Option | For | Against |
|---|---|---|
| **Embed inside the Worker through the AI binding, in small resumable batches** | no token; fits Workers Free | index can lag a few minutes |
| `waitUntil` for inline indexing | faster save | only if p95 > 1 s |
| Cron every 15 minutes | faster completion | keeps Neon awake; more compute |

## Decision

- Inline on book create, edit or archive with a 2 s budget; a failure never fails the save.
- `syncAll` after a demo reset.
- `POST /api/admin/discovery/reindex` (STAFF_MANAGE, 2/min) for backfill; resumable and idempotent.
- Cron `5 * * * *` runs one batch only when something is missing or stale; `INDEX_BATCH_BOOKS` default 8 (each book is 2–3 chunks). The scheduled handler branches on the cron expression; the nightly reset runs only at `0 0 * * *`.

## Consequences

- Hourly at minute 5 saves Neon compute (about 15 vs 60 free CU-hours a month) and never collides with the 00:00 reset.

## Sources

design notes; docs/ai.md; Confluence page 19169328; Jira SLM-16; Confluence page 19464205; owner conversation, 2026-11-25; owner conversation, 2026-11-24; PR #20; commit c8099f7; decisions/rbac-matrix.md:24,36
