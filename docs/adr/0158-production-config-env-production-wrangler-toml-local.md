# 0158. Production config in `[env.production]` of wrangler.toml; local is the top level

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** infra
- **Deciders:** Engineering, architecture review

## Context

Local runs need fake AI and local Postgres; production needs bindings.

## Options considered

| Option | For | Against |
|---|---|---|
| **Top level = local; `[env.production]` = Hyperdrive, AI, limiters, crons** | a production build can't miss bindings | two blocks to keep aligned |

## Decision

- `npm run deploy` = build + `wrangler deploy --env production`; `db:setup` migrates and seeds.
- Secrets: SESSION_SECRET (≥ 32), demo passwords (≥ 12); empty GOOGLE_CLIENT_ID means Google is off.
- The production block lives on main, without secrets.

## Consequences

- First deploys ran from a branch before the block was merged.

## Sources

design notes; Confluence page 19365918; Confluence page 19333121; Jira SLM-10
