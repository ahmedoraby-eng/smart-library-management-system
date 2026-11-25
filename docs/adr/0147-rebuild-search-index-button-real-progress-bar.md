# 0147. 'Rebuild search index' button with a real progress bar

- **Status:** Accepted
- **Date:** 2026-11-25
- **Area:** ux
- **Deciders:** Ahmed Oraby (owner)

## Context

A full rebuild of 64 books takes about 4 minutes and must not look frozen.

> Ahmed Oraby: «يبقى في بروجرس بار بيدي عدد او برسنتج، سواء عدد كتب خلص او برسنتج نسبه بروجرس»

## Options considered

| Option | For | Against |
|---|---|---|
| **Admin button that loops batches and shows progress** | visible, resumable | a few UI states |
| Cron-only backfill | no UI | nothing to show the owner |

## Decision

- The Admin dashboard button loops reindex batches until none remain and waits through the 2/min limiter.
- Determinate progress bar 'X of Y books · Z %' plus 'next batch in Ns' (e.g. '24 of 64 books · 38%'); theme tokens only, both themes.
- Treated as a minor change (UX quick look).

## Consequences

- The endpoint returns total and remaining for the bar.

## Sources

Public: PR #21

Also from the owner's working notes and conversations (not published): owner conversation, 2026-11-25; design notes
