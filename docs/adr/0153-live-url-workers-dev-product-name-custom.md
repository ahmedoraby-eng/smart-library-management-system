# 0153. Live URL on workers.dev with the product name only; no custom domain

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** infra
- **Deciders:** DevOps

## Context

Reviewers need one neutral link at no cost.

## Options considered

| Option | For | Against |
|---|---|---|
| **`smart-library.ahmedoraby.workers.dev`** | free, nothing to renew | a long URL |
| Custom domain (~$10) | nicer | cost and renewals; only if a name showed |

## Decision

- Worker named `smart-library` on workers.dev.
- A new domain would be attached (before registering the OAuth redirect) only if the subdomain showed a forbidden name.

## Consequences

- The OAuth redirect URI uses this host.

## Sources

Public: docs/architecture.md

Also from the owner's working notes and conversations (not published): design notes; decisions/architecture.md:335; decisions/infra.md:22; Confluence page 19267692; Jira SLM-10; Jira SLM-6
