# 0009. Sign-in: Google OIDC in the app plus demo accounts, with no password hashing

- **Status:** Accepted
- **Date:** 2026-11-24
- **Deciders:** Ahmed Oraby (owner), architecture review

## Context

- Reviewers must be able to try borrowing and returns without an account we provision, and the app needs real SSO.
- An earlier draft used Cloudflare Access, and it failed twice: its one-time PIN can't sign a reviewer in as a shared demo identity, and its login page shows our access team name.
- Storing demo passwords as PBKDF2 hashes ([0010](0010-pbkdf2-demo-password-hashes.md)) was dropped.

## Options considered

| Option | For | Against |
|---|---|---|
| Access proxy (Cloudflare Access) | no auth code | no shared demo identity; shows a team name |
| A role switcher in the UI | easy demo | privilege escalation in a public app |
| **Google OIDC (code + PKCE) in our API + two demo accounts from Worker secrets** | real SSO; reviewers can use shared demo roles | about 150 lines of standard auth code |

## Decision

- **Google:** authorization code with PKCE, state and nonce. The ID token is verified (`iss`, `aud`, `exp`, `email_verified`).
- **Demo Librarian and Demo Admin:**
  - Their emails and passwords live only in Worker secrets.
  - Sign-in compares SHA-256 digests in constant time.
  - Passwords must be 12 or more random characters, and the config refuses less.
  - Demo login is limited to 5 attempts a minute per IP. A wrong email and a wrong password get the same generic `401`.
- **New Google users** become a read-only Supervisor, unless their email is in `BOOTSTRAP_ADMIN_EMAILS`.
- **Session:** an HS256 JWT in an HttpOnly, SameSite=Lax cookie, valid for 8 hours, holding only the staff id.
- There is no auth bypass in any environment.

## Consequences

- We gave up a slow hash. Nothing is stored, so there is no hash to protect, and PBKDF2 at a safe cost would exceed the 10 ms CPU limit of Workers Free.
- Demo accounts are locked against role and status changes (`409 PROTECTED_DEMO_ACCOUNT`).
