# 0011. Roles read from the database on every request

- **Status:** Accepted
- **Date:** 2026-11-24
- **Deciders:** Ahmed Oraby (owner), architecture review

## Context

A role change or a disable must take effect at once, and a cookie must not be able to claim a role.

## Options considered

| Option | For | Against |
|---|---|---|
| Role in the session token | no DB read | stale until the token expires; a forged claim is dangerous |
| **The token holds only the staff id; the role is loaded from `staff_users` on each request** | changes apply on the next request | one indexed read per request |

## Decision

- Middleware verifies the cookie, loads the staff row and builds the permissions from the stored role.
- Every route declares `requirePermission(...)`, and services re-check writes.
- Role and status changes run under row locks and keep at least one active Admin.
- An `rbac-matrix` test covers every role × endpoint, and fails if a route has no row.

## Consequences

- A disabled user is out on the next request (`403 USER_DISABLED`).
- The UI's show/hide from `GET /api/me` is a convenience only.
