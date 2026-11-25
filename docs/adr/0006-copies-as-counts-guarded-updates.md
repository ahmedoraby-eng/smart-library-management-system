# 0006. Copies as counts; borrow and return as one transaction with guarded updates

- **Status:** Accepted
- **Date:** 2026-11-24
- **Deciders:** Ahmed Oraby (owner), architecture review

## Context

Borrow and return must stay consistent when librarians work at the same time. The brief needs no per-copy identity (barcode, condition, shelf).

## Options considered

| Option | For | Against |
|---|---|---|
| Per-copy entity | per-copy history | one more step in every borrow; not required |
| Read, then write | simple | races: two librarians take the last copy |
| **Counts + atomic conditional `UPDATE` in one transaction, with a `CHECK` as backstop** | race-proof by the database; one invariant | per-copy questions can't be answered |

## Decision

- **Stock:** `books.total_copies` and `available_copies`, with `CHECK (0 <= available_copies <= total_copies)`.
- **Borrow:**
  1. Lock the member row (`FOR UPDATE`), so the loan-limit count is safe.
  2. Run `UPDATE books SET available_copies = available_copies - 1 WHERE id = ? AND archived_at IS NULL AND available_copies > 0`. Zero rows updated gives `409 BOOK_UNAVAILABLE`.
  3. Insert the loan. A partial unique index on `(member_id, book_id) WHERE returned_at IS NULL` allows one open loan per member and title.
- **Return:**
  1. Run `UPDATE loans ... WHERE returned_at IS NULL`. Zero rows updated gives `409 LOAN_ALREADY_RETURNED`.
  2. Add the copy back.
- **Edits:** a `version` column, so a stale update gets `409 STALE_VERSION`.
- **Books with history** are archived, not deleted.

## Consequences

- Evidence: 20 parallel borrows of a 3-copy book give exactly 3 loans, on real Postgres.
- If copies ever need identity, the migration path is `book_copies` + `loans.copy_id`, with `available_copies` as a view.
