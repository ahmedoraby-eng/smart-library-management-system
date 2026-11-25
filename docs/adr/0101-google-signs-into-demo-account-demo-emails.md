# 0101. Google never signs into a demo account; demo emails must use reserved domains

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** security
- **Deciders:** Architecture

## Context

If a real address were set as a demo email, Google sign-in would give Admin without a password.

## Options considered

| Option | For | Against |
|---|---|---|
| **Refuse demo rows on the Google path; enforce reserved TLDs at startup** | closes the escalation path | demo emails look artificial |

## Decision

- `signInWithGoogle` refuses a configured demo email or any `is_demo` row.
- `loadConfig` requires demo emails to end in .test, .invalid or .example (production: `librarian@smartlibrary.example`, `admin@smartlibrary.example`), or the Worker won't start.
- Both conditions were required before Google could be switched on.

## Consequences

- Demo accounts are reachable only through the demo form.

## Sources

Public: PR #12; commit b40266f

Also from the owner's working notes and conversations (not published): design notes; owner conversation, 2026-11-24
