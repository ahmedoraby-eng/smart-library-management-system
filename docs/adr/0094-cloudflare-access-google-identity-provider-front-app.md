# 0094. Cloudflare Access with Google as identity provider in front of the app

- **Status:** Superseded by [0009](0009-google-oidc-and-demo-accounts.md)
- **Date:** 2026-11-24
- **Area:** security
- **Deciders:** Architecture

## Context

The all-Cloudflare drafts put SSO in front of the app with no auth code of our own.

## Options considered

| Option | For | Against |
|---|---|---|
| **Cloudflare Access (free ≤ 50 users) + Google IdP, email PIN fallback** | zero-code SSO | no shared demo identity; login page shows our team name |

## Decision

Access protects the app; the backend verifies `Cf-Access-Jwt-Assertion` (JWKS, aud); unknown emails become read-only Supervisors; Playwright uses a service token.

## Consequences

- Dropped the same day: its one-time PIN can't sign a reviewer in as a shared demo identity, and its page shows the access team name. Replaced by in-app Google OIDC + demo accounts (ADR 0009).

## Sources

Public: docs/architecture.md

Also from the owner's working notes and conversations (not published): owner conversation, 2026-11-24; design notes; decisions/architecture.md:280; decisions/infra.md:23,99; decisions/ux.md:298,296
