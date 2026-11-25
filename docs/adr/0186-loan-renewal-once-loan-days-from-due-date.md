# 0186. Loan renewal: once, by LOAN_DAYS from the current due date, recorded in `renewed_at`/`renewed_by`

- **Status:** Proposed
- **Date:** 2026-11-25
- **Area:** data
- **Deciders:** Engineering (SLM-18); architecture review on the PR

## Context

SLM-18 adds renewal as a demo extra: a Librarian or Admin extends an open loan that is not overdue, once. Two staff members may press Renew on the same loan at the same moment, and loan status must stay derived ([0007](0007-derived-overdue-status.md)).

## Options considered

| Option | For | Against |
|---|---|---|
| **`renewed_at` + `renewed_by` columns, one guarded UPDATE** | "renewed" is a fact with a time and an actor, like `returned_at`/`returned_by`; the WHERE clause is the whole rule, so parallel renewals are decided by the row lock | two columns for a yes/no fact |
| `renewal_count` integer | allows "renew up to N times" later | no time or actor; a rule change would still need a policy |
| A `loan_renewals` table | full history of many renewals | more than a one-renewal rule needs |

## Decision

- `POST /api/loans/:id/renew` (permission `LOAN_PROCESS`: Admin, Librarian) runs one statement: `due_at = due_at + LOAN_DAYS`, `renewed_at`/`renewed_by` set, `WHERE returned_at IS NULL AND renewed_at IS NULL AND due_at >= now` (now from the injected clock, the complement of the overdue fragment).
- When no row is updated, the loan is read to explain why, in this order: 404, `409 LOAN_ALREADY_RETURNED`, `409 LOAN_ALREADY_RENEWED`, `409 LOAN_OVERDUE`.
- The period is the borrow default (`LOAN_DAYS`), counted from the current due date, not from today.
- Migration `0006_loan_renewal.sql` is additive: two nullable columns and a CHECK that both are set together and not before the borrow.
- The member's status is not checked: a renewal is allowed for an inactive member, as a return is ([0035](0035-inactive-members-can-t-borrow-but-can.md)), because the ticket sets no such rule.

## Consequences

- "Renew more than once" would mean a count or a history table and a new rule.
- `LoanDto.renewedAt` is optional in the contract, so older payloads read as "never renewed".

## Sources

Public: Jira SLM-18 (loan renewal and overdue alerts); this PR.
