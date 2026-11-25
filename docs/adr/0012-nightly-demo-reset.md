# 0012. Nightly demo data reset

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** demo
- **Deciders:** Ahmed Oraby (owner), architecture review

## Context

Reviewers edit, borrow and delete on a public demo. Their changes would degrade it for the next reviewer.

## Options considered

| Option | For | Against |
|---|---|---|
| No reset | nothing to run | the demo decays |
| **Cron Trigger at 00:00 UTC (02:00 Cairo) + an Admin button** | the demo is always clean; free | reviewer changes are lost overnight |

## Decision

- A Cron Trigger restores books, members and loans every night. Staff accounts are kept.
- Admins can also run «Reset demo data» on demand (`POST /api/admin/reset-demo`).
- The reset reuses the search vectors of unchanged text, so it costs no AI ([0019](0019-ai-cost-tiers-and-quotas.md)).

## Consequences

- The search index is rebuilt after each reset ([0016](0016-hybrid-retrieval-rrf.md)).
- The hourly index job runs at minute 5, so it never collides with the reset.

## Notes

The reset is one transaction (truncate loans, members and books, then load seed/demo.sql), shares its code with the Admin button, and the nightly run also purges expired AI cache rows.

## Sources

Public: docs/architecture.md; commit da20579

Also from the owner's working notes and conversations (not published): decisions/architecture.md:242,294; decisions/infra.md:25; decisions/engineering-plan.md:98-105; owner conversation, 2026-11-24; Confluence page 19365918; Jira SLM-8
