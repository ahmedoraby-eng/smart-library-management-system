# 0077. Errors are RFC 9457 Problem Details with a stable code and request id

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** architecture
- **Deciders:** Architecture

## Context

The UI needs one error shape to map, and errors must never leak internals.

## Options considered

| Option | For | Against |
|---|---|---|
| **Problem Details + `code`, `errors[]`, `requestId`** | standard, one mapping in the UI | a little more structure |
| Custom error JSON | free form | each module invents its own |

## Decision

- Shape: type, title, status, code, detail, `errors[{field,message}]`, requestId; a 500 is generic, never a stack trace.
- Codes: 400 VALIDATION_FAILED; 401 INVALID_CREDENTIALS; 403 FORBIDDEN / NOT_PROVISIONED / USER_DISABLED; 404 NOT_FOUND; 409 BOOK_UNAVAILABLE, ALREADY_BORROWED, LOAN_LIMIT_REACHED, MEMBER_INACTIVE, LOAN_ALREADY_RETURNED, BOOK_HAS_ACTIVE_LOANS, TOTAL_BELOW_LOANED, STALE_VERSION, DUPLICATE_ISBN, DUPLICATE_EMAIL, PROTECTED_DEMO_ACCOUNT, CANNOT_CHANGE_SELF, LAST_ADMIN.
- Every 429 carries Retry-After in seconds; the UI shows a countdown.
- An optional `context` object (added in SLM-1) carries non-sensitive facts for a 409, e.g. DUPLICATE_ISBN {bookId,title}; never new top-level keys.

## Consequences

- New codes go into `contracts/` first.

## Sources

Public: docs/architecture.md

Also from the owner's working notes and conversations (not published): decisions/architecture.md:259-266; decisions/architecture.md:266; decisions/architecture.md:265
