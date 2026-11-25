# 0045. The owner does sign-in and secret-paste steps; agents never see secrets

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** process
- **Deciders:** DevOps

## Context

Some steps need the owner's own logins: GitHub, Cloudflare, Neon, Google OAuth, Worker secrets.

## Options considered

| Option | For | Against |
|---|---|---|
| **DevOps prepares every command; the owner runs the sign-in and paste steps** | no secret passes through an agent | about 25 minutes of owner time |

## Decision

- About 25 minutes of owner-only steps: GitHub repo, Cloudflare account, Neon, Hyperdrive command, OAuth client, secrets.
- DevOps prepares each command; the owner pastes the secret values himself.

## Consequences

- Database strings and passwords stay off the agents' machines and out of chat.

## Sources

decisions/infra.md:77-85
