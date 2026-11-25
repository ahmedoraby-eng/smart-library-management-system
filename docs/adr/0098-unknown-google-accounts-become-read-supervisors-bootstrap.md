# 0098. Unknown Google accounts become read-only Supervisors; bootstrap Admins by email list

- **Status:** Accepted (supersedes [0097](0097-deny-sign-unknown-google-accounts.md))
- **Date:** 2026-11-24
- **Area:** security
- **Deciders:** Product owner, architecture review

## Context

Reviewers should be able to look around with their own account without changing data.

## Options considered

| Option | For | Against |
|---|---|---|
| **Auto-create as SUPERVISOR; `BOOTSTRAP_ADMIN_EMAILS` become ADMIN** | safe self-service look | anyone with Google can read the demo data |

## Decision

- Any verified Google account not yet known is created as SUPERVISOR (read-only) and sees a notice pointing to the demo Librarian.
- Emails in `BOOTSTRAP_ADMIN_EMAILS` become ADMIN on first sign-in; Admins promote others.
- DISABLED users get 403.

## Consequences

- Demo data is fictional, so read access is harmless.

## Sources

decisions/architecture.md:288; decisions/scope.md:49; decisions/rbac-matrix.md:35; Jira SLM-8; Confluence page 19365918
