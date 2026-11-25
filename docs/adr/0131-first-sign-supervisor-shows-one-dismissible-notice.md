# 0131. First sign-in as Supervisor shows one dismissible notice

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** ux
- **Deciders:** UX

## Context

A reviewer signing in with their own Google lands read-only and may not know why.

## Options considered

| Option | For | Against |
|---|---|---|
| **One info notice on the dashboard** | explains read-only access | one more element |

## Decision

Auto-provisioned Supervisors see a dismissible notice pointing to the demo Librarian account from the submission email. No credentials appear in the UI.

## Consequences

- Dismissal is remembered.

## Sources

Public: web/src/

Also from the owner's working notes and conversations (not published): decisions/ux.md:48; decisions/architecture.md:288
