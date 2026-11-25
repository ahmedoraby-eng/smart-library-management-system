# 0040. Reuse from other projects is limited to general patterns

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** process
- **Deciders:** Ahmed Oraby (owner)

## Context

The team has working patterns from other projects, but the SLM repo is public.

## Options considered

| Option | For | Against |
|---|---|---|
| **Reuse only general patterns; prefer re-implementing** | nothing confidential leaks | some work repeated |

## Decision

- May reuse general patterns: API conventions, auth, CI/CD, test utilities.
- Never reuse domain logic, confidential data, private repositories or secrets.

## Consequences

- Shared CI workflows from the common engineering playbook are allowed (they are generic).

## Sources

master prompt
