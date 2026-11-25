# 0103. Rate limiting: Workers Rate Limiting bindings, with a per-isolate in-memory fallback

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** security
- **Deciders:** Ahmed Oraby (owner), architecture review

## Context

A public demo with shared demo accounts and a quota-bound AI needs limits on sign-in attempts, the deep health check, AI discovery and the reindex. A limit held in a Worker's memory only counts per isolate, and the first walking skeleton rebuilt its limiters on every request, so they never limited anything (a blocking finding in the review of PR #1).

## Options considered

| Option | For | Against |
|---|---|---|
| **Cloudflare Workers Rate Limiting bindings (`[[ratelimits]]`), with an in-memory limiter as fallback, both behind one `Limiter` interface** | shared across isolates and locations; free; no store to run; tests run without Cloudflare | fixed periods; counts are approximate |
| In-memory limiter only | no binding | per isolate only, so traffic spread over isolates isn't limited |
| Counters in Postgres | exact | a database write on every sign-in attempt; Neon can't sleep |

## Decision

- One `Limiter` interface in `api/src/platform/security/rateLimit.ts`. `BindingLimiter` uses the Workers binding. `MemoryLimiter` (fixed window, created once at module scope, never per request) is the fallback when no binding exists (tests, some local runs). `limiterFor` picks one.
- Limits per minute:
  - demo login: 5 per IP;
  - Google start and Google callback: 10 each per IP;
  - AI discovery: 10 per staff user;
  - deep health (`?deep=1`): 10;
  - discovery reindex: 2 (Admin only).
- A refused request gets `429 RATE_LIMITED` with `Retry-After` in seconds; the UI shows a countdown.
- The app (and so its limiters) is built once per isolate, not per request. This was the fix for the PR #1 finding, proven by `worker-entry.test.ts`: the 6th demo login gets 429, and another IP doesn't.

## Consequences

- Limits hold across isolates in production; locally they hold per process.
- A nit is left for later: deep health opens the database connection before the limit check.
- The AI quotas and the Neuron cap ([0019](0019-ai-cost-tiers-and-quotas.md)) are separate daily limits kept in Postgres; these are short burst limits.

## Sources

Public: api/src/platform/security/rateLimit.ts; wrangler.toml (ratelimits); PR #1 review and re-review; docs/architecture.md; PR #1; commit bf13a4a; wrangler.toml [[ratelimits]]

Also from the owner's working notes and conversations (not published): owner conversation, 2026-11-24; Confluence page 19365918; Jira SLM-8; Jira SLM-9; decisions/infra.md:50-69; decisions/architecture.md:239,328; decisions/rbac-matrix.md:23
