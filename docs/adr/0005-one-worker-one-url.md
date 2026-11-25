# 0005. One Worker serves the SPA and the API on one URL

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** architecture
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

## Notes

Bindings: HYPERDRIVE, AI and the rate limiters, plus one Cron Trigger. Hosts considered and rejected: Pages + Functions, Render/Fly, Cloud Run. Worker request-time limits suit short OLTP calls, not long jobs.

## Sources

Public: docs/architecture.md; wrangler.toml [assets]

Also from the owner's working notes and conversations (not published): Confluence page 19365918; decisions/architecture.md:20,334; decisions/infra.md:19; owner conversation, 2026-11-24
