# 0157. Workers Free 10 ms CPU is the main platform risk; measure it on the deployed skeleton

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** infra
- **Deciders:** DevOps

## Context

Workers Free allows about 10 ms CPU per request.

## Options considered

| Option | For | Against |
|---|---|---|
| **Measure early; Workers Paid $5 only as the owner's call** | $0 if it fits | a late surprise if not measured |

## Decision

DevOps measured CPU per request on the deployed skeleton on day 2 morning. Heavy work (reindex, reset) runs in small batches.

## Consequences

- This limit shaped the demo-password check (ADR 0009) and the batch sizes.

## Sources

Public: docs/architecture.md

Also from the owner's working notes and conversations (not published): decisions/infra.md:43; decisions/engineering-plan.md:183
