# 0099. Google sign-in built and tested, but off in production until an OAuth client exists

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** security
- **Deciders:** Engineering, architecture review

## Context

The OAuth client and redirect URI weren't registered before the first deploys.

## Options considered

| Option | For | Against |
|---|---|---|
| **Hidden behind config; demo accounts work meanwhile** | honest status; nothing blocked | Google path proven only by mocked tests until then |
| arctic library | less code | an extra dependency; jose is already used |

## Decision

- Code + PKCE S256 + state + nonce, ID token verified with `jose` + fetch against Google JWKS; unverified email rejected.
- Routes return 404 and the button is hidden while `GOOGLE_CLIENT_ID/SECRET` are unset; config refuses only one of the two.
- Start and callback limited to 10/min per IP. No `POST /staff-users`: people appear on first sign-in.

## Consequences

- One real Google sign-in on the live site is still required before SLM-8 is Released.

## Sources

Public: PR #12

Also from the owner's working notes and conversations (not published): owner conversation, 2026-11-24; design notes; Confluence page 19365918; Jira SLM-8; engagement notes
