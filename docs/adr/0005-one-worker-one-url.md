# 0005. One Worker serves the SPA and the API on one URL

- **Status:** Accepted
- **Date:** 2026-11-24
- **Deciders:** Ahmed Oraby (owner), architecture review

## Context

Reviewers need one link. A separate front-end host means CORS, two deploys and two URLs.

## Options considered

| Option | For | Against |
|---|---|---|
| Static host + API host | independent scaling | CORS, two deploys, token handling in the SPA |
| **One Worker: static assets + `/api/*`** | same origin, HttpOnly cookie session, one deploy | UI and API deploy together |

## Decision

The Worker serves `web/dist` with an SPA fallback, and requests to `/api/*` reach Hono first (`run_worker_first`). The Worker keeps no state of its own: sessions are signed cookies, and the data is in Postgres.

## Consequences

- No CORS, and no token in the browser.
- The URL, the OAuth client and the UI carry only the product name.
