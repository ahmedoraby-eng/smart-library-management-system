# 0104. CSRF defence: SameSite=Lax cookie, JSON-only bodies and an Origin check

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** security
- **Deciders:** Architecture

## Context

A cookie session needs CSRF protection.

## Options considered

| Option | For | Against |
|---|---|---|
| **Three simple layers, each tested** | no tokens to manage | relies on browsers sending Origin |
| CSRF tokens | classic | more code in the SPA |

## Decision

Every non-GET request must have Origin equal to the app's own origin and, with a body, a JSON content type; the cookie is SameSite=Lax.

## Consequences

- A foreign Origin gets 403 (tested).

## Sources

decisions/architecture.md:287; decisions/engineering-plan.md:78; Confluence page 19365918; Jira SLM-1
