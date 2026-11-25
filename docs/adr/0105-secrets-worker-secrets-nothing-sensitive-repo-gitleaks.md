# 0105. Secrets only as Worker secrets; nothing sensitive in the repo; gitleaks in CI

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** security
- **Deciders:** DevOps, architecture review

## Context

The repo is public.

## Options considered

| Option | For | Against |
|---|---|---|
| **`wrangler secret put` + git-ignored `.dev.vars`; secret scan on full history** | no secret can leak through git | secrets set by hand |

## Decision

- SESSION_SECRET, demo passwords and GOOGLE_CLIENT_SECRET are Worker secrets; public config is in `wrangler.toml`; only `.dev.vars.example` (names only) is in the repo.
- The Neon runtime password lives only in the Hyperdrive config; the database string never goes into GitHub or Cloudflare build settings.
- Workers AI needs no key. gitleaks scans the full history in CI.

## Consequences

- Rotating a secret is a manual `wrangler secret put`.

## Sources

design notes; ci.yml hygiene job; docs/architecture.md Deployment; Confluence page 19365918; Confluence page 19333121; Jira SLM-6; Jira SLM-10; decisions/infra.md:30-38,81
