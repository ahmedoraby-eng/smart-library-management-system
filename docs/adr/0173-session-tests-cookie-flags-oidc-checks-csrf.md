# 0173. Session tests: cookie flags, OIDC checks, CSRF, logout; JWT revocation limit documented

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** testing
- **Deciders:** QA

## Context

A stateless JWT can't be revoked before it expires.

## Options considered

| Option | For | Against |
|---|---|---|
| **Test each flag and document the limit** | honest about the gap | an old cookie still verifies |

## Decision

Tests assert each cookie flag, OIDC state/PKCE/claims checks, CSRF Origin/Content-Type, and that logout clears the cookie. A replayed old cookie still verifies (documented); disabling the user in the database is the revocation path.

## Consequences

- Revisit with a session table if instant revocation is needed.

## Sources

Public: api/test/

Also from the owner's working notes and conversations (not published): decisions/test-strategy.md:88-107
