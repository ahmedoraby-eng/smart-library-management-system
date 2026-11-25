# 0106. Google OAuth client named 'Smart Library' with minimal scopes, consent screen published

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** security
- **Deciders:** DevOps

## Context

The consent screen is what reviewers see when they sign in.

## Options considered

| Option | For | Against |
|---|---|---|
| **Own Google Cloud project; openid email profile only; published External consent** | any Google account works; no verification needed | the owner's personal support email is shown |

## Decision

- OAuth app name 'Smart Library', support email the owner's personal one.
- Scopes openid, email, profile (non-sensitive); consent screen External and published, not limited to test users.
- Redirect URI `<app URL>/api/auth/google/callback`.

## Consequences

- No employer name appears on the consent screen.

## Sources

decisions/architecture.md:275; decisions/infra.md:10,47,83; owner conversation, 2026-11-24
