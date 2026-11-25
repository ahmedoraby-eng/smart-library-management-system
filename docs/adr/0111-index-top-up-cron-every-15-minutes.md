# 0111. Index top-up cron every 15 minutes with 16-book batches

- **Status:** Superseded by [0110](0110-index-sync-inline-save-after-reset-admin.md)
- **Date:** 2026-11-25
- **Area:** ai
- **Deciders:** Engineering, architecture review

## Context

The first hybrid-search implementation filled the index on a frequent schedule.

## Options considered

| Option | For | Against |
|---|---|---|
| **`*/15 * * * *`, INDEX_BATCH_BOOKS 16** | index completes fast | Neon never sleeps; 32–48 vectors may break 10 ms CPU |

## Decision

The embedding top-up ran every 15 minutes, 16 books per batch.

## Consequences

- Architecture review on PR #20 required an hourly offset cron and 8-book batches (or proof that 16 fits); replaced.

## Sources

Public: PR #20

Also from the owner's working notes and conversations (not published): Jira SLM-16
