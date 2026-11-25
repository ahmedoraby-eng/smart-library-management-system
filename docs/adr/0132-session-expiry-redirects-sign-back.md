# 0132. Session expiry redirects to sign-in and back

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** ux
- **Deciders:** UX

## Context

The 8-hour cookie will expire during use.

## Options considered

| Option | For | Against |
|---|---|---|
| **401 → `/signin?next=<path>` with a notice** | user lands where they were | the next path must be checked |

## Decision

On a 401, redirect to `/signin?next=<path>` with 'Your session ended…'; after sign-in return to `next` (same-origin paths only).

## Consequences

- Unsaved form input is lost.

## Sources

decisions/ux.md:49
