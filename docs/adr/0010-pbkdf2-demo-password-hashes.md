# 0010. PBKDF2 hashes for demo account passwords in the database

- **Status:** Superseded by [0009](0009-google-oidc-and-demo-accounts.md)
- **Date:** 2026-11-24
- **Area:** security
- **Deciders:** Ahmed Oraby (owner), architecture review

## Context

The first plan stored the demo staff passwords as PBKDF2 hashes in `staff_users`.

## Options considered

| Option | For | Against |
|---|---|---|
| PBKDF2 hashes in the DB | standard for stored passwords | nothing needs storing; a safe iteration count exceeds the Workers Free CPU limit |

## Decision

Store PBKDF2 hashes, seeded with the demo users.

## Consequences

Replaced in the walking-skeleton review. The passwords stay in Worker secrets and are compared as SHA-256 digests in constant time, with a 12-character minimum and a login rate limit that holds across requests.

## Sources

Public: docs/architecture.md

Also from the owner's working notes and conversations (not published): decisions/test-strategy.md:106; decisions/architecture.md:278
