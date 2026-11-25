# 0097. Deny sign-in to unknown Google accounts

- **Status:** Superseded by [0098](0098-unknown-google-accounts-become-read-supervisors-bootstrap.md)
- **Date:** 2026-11-24
- **Area:** security
- **Deciders:** Product owner

## Context

The first RBAC draft let in only pre-registered staff emails.

## Options considered

| Option | For | Against |
|---|---|---|
| **Deny unknown emails** | tight | reviewers can't look with their own account |

## Decision

Unknown Google emails were refused.

## Consequences

- Replaced: unknown verified accounts become read-only Supervisors.

## Sources

Public: docs/architecture.md

Also from the owner's working notes and conversations (not published): decisions/rbac-matrix.md:35
