# 0160. Manual deploy with `npm run deploy` from a deploy branch

- **Status:** Superseded by [0022](0022-workers-builds-auto-deploy.md)
- **Date:** 2026-11-24
- **Area:** cicd
- **Deciders:** DevOps

## Context

With the deadline close, the first live deploys were run by hand.

## Options considered

| Option | For | Against |
|---|---|---|
| **Dry run, migrations + seed on Neon, deploy, smoke** | safe and quick | not automatic; no automated smoke |

## Decision

PR CI checks only; deploy is a manual `npm run deploy` via wrangler from a local deploy branch, migrations with the owner pasting the Neon string; no DB secret in GitHub.

## Consequences

- Replaced on 25/11 by auto-deploy through Workers Builds (ADR 0022); `npm run deploy` stays for manual use.

## Sources

Public: .github/workflows/

Also from the owner's working notes and conversations (not published): owner conversation, 2026-11-24
