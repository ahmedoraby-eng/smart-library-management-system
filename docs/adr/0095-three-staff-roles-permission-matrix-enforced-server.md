# 0095. Three staff roles with a permission matrix enforced on the server

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** security
- **Deciders:** Product owner, architecture review

## Context

The brief asks for role-based access; hiding buttons is not security.

## Options considered

| Option | For | Against |
|---|---|---|
| **Admin / Librarian / Supervisor, permissions in `contracts/src/auth.ts`** | one matrix for API and UI | matrix must cover every route |

## Decision

- All roles: BOOK_READ, MEMBER_READ, LOAN_READ, REPORT_READ, AI_DISCOVER (Supervisor may use discovery and sees who processed loans).
- Admin + Librarian: BOOK_WRITE, MEMBER_WRITE, LOAN_PROCESS (Librarian deactivates members through `PUT /api/members/{id}`).
- Admin only: BOOK_DELETE, STAFF_MANAGE (incl. demo reset and reindex).
- Supervisor is read-only: no Borrow buttons, Circulation hidden; deep links to forbidden pages show /403.
- Every route is checked on the server; the frontend only hides.

## Consequences

- No separate Report permission: reports are the dashboard.

## Sources

master prompt; owner conversation, 2026-11-24; docs/architecture.md; design notes; decisions/rbac-matrix.md:13-26; decisions/architecture.md:297-306; Confluence page 19365918; Jira SLM-8; decisions/rbac-matrix.md:31; decisions/rbac-matrix.md:32
