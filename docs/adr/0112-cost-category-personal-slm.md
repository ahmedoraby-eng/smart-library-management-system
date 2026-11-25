# 0112. Cost category 'Personal – SLM'

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** cost
- **Deciders:** Ahmed Oraby (owner)

## Context

AI-agent and service spend for SLM must not be charged to the owner's employer work.

## Options considered

| Option | For | Against |
|---|---|---|
| **Own category, logged with the project's cost tracking** | clean separation of spend | one more category |

## Decision

- All SLM spend (agent sessions, services) is logged under 'Personal – SLM'.
- Agents use the cheapest capable model per task, high reasoning only for architecture and critical reviews, few subagents, no paid service without a reason.

## Consequences

- Shared work (e.g. a disk cleanup) is split by category.

## Sources

owner conversation, 2026-11-24; design notes; master prompt; engagement notes
