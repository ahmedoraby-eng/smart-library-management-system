# 0113. Run on free tiers at about $0 a month; going over a limit fails safe, never bills

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** cost
- **Deciders:** DevOps, architecture review

## Context

The demo must cost nothing to run and must not surprise anyone with a bill.

## Options considered

| Option | For | Against |
|---|---|---|
| **Workers Free, Hyperdrive Free, Neon Free, Workers AI free allocation, workers.dev** | $0; safe failure | Neon sleeps after 5 idle minutes |
| Workers Paid ($5/month) | higher CPU and limits | a bill; only if the 10 ms CPU limit bites, owner's call |

## Decision

- Workers Free (100k requests/day), Hyperdrive Free (100k queries/day), Neon Free, Workers AI free 10,000 Neurons/day, public-repo GitHub Actions, no custom domain.
- Hosting must be a free tier where overage fails safely, or behind a spend cap; DevOps confirms the terms first.
- Over the AI allocation, discovery falls back to keywords instead of billing.

## Consequences

- Target cost $0.

## Sources

Public: docs/ai.md

Also from the owner's working notes and conversations (not published): decisions/architecture.md:343; decisions/infra.md:4,43; Confluence page 19464205; Jira SLM-10
