# 0029. Out of scope: payments, fees, member portal, reservations, notifications, multi-branch

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** scope
- **Deciders:** Ahmed Oraby (owner)

## Context

The brief asks for core library operations. Extra domains would eat the 3 days.

## Options considered

| Option | For | Against |
|---|---|---|
| **Exclude money, member self-service and extra channels** | keeps focus on the core | fewer features to show |

## Decision

Excluded: payments, rental fees, subscriptions, fines and automated late processing, member login or portal, reservations and holds, extra reports, email/SMS, multi-branch, per-copy barcodes, microservices. An overdue indicator is fine; the UI never shows fee, fine or payment.

## Consequences

- These go to 'future improvements' in the submission.

## Sources

Public: README.md

Also from the owner's working notes and conversations (not published): master prompt; backlog/slm-tickets-draft.md:126; decisions/scope.md:54-60
