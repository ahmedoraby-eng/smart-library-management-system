# 0089. Loan history is permanent: loans are never deleted, and the acting staff is recorded

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** data
- **Deciders:** Product owner, architecture review

## Context

Who lent and who took back a book must be answerable later.

## Options considered

| Option | For | Against |
|---|---|---|
| **FK RESTRICT; processed_by and returned_by on every loan** | full audit of circulation | rows grow forever |

## Decision

- Loans FK to books and members `ON DELETE RESTRICT`; a loan is never deleted.
- `processed_by` and `returned_by` store the staff user.
- Loan CHECKs: `due_at > borrowed_at`; `returned_at` null or ≥ `borrowed_at`.

## Consequences

- Supervisors can see which staff processed a loan.

## Sources

Confluence page 19398657; Jira SLM-4; decisions/scope.md:46; decisions/architecture.md:180
