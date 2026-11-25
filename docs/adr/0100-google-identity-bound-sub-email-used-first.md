# 0100. Google identity bound by `sub`; email used only for the first bind

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** security
- **Deciders:** Architecture

## Context

Email can change at Google, and two Google accounts can claim the same email.

## Options considered

| Option | For | Against |
|---|---|---|
| **Look up by `google_sub`, bind once by email** | stable identity | one more column |
| Key by email only | simple | a different account with the same email gets in |

## Decision

- `staff_users.google_sub` (unique when set, migration 0003); look up by sub first.
- First email match binds the sub with a conditional UPDATE; a different sub for the same email is refused.

## Consequences

- An email change at Google keeps the same user.

## Sources

Public: PR #12; PR #15; commit b40266f

Also from the owner's working notes and conversations (not published): Confluence page 19365918; Confluence page 19333121
