# 0134. Staff users screen: inline role select, Disable/Enable, locked demo rows, Reset demo data

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** ux
- **Deciders:** UX

## Context

Admins manage staff, and the demo must survive reviewers.

## Options considered

| Option | For | Against |
|---|---|---|
| **Inline controls with confirm and server-side guards** | quick admin work | revert logic on 409 |

## Decision

- `/admin/users` (STAFF_MANAGE): inline role select that reverts on 409, Disable with confirm, Enable as secondary.
- Own row guarded; demo rows show a lock and 'Demo' tag, with no active edit controls.
- 'Reset demo data' with a danger confirm; pagination hides Previous/Next on a single page.

## Consequences

- E2E asserts demo rows can't be edited.

## Sources

Public: commit 577649e; commit b40266f; PR #11

Also from the owner's working notes and conversations (not published): decisions/ux.md:208-210; decisions/test-strategy.md:125
