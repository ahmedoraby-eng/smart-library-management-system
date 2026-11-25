# 0043. Technology choice delegated to architecture; Java closeness is only a preference

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** process
- **Deciders:** Ahmed Oraby (owner)

## Context

The owner reads Java best, but the build window is 3 days.

> Ahmed Oraby: «مش مانداتوري خالص»

## Options considered

| Option | For | Against |
|---|---|---|
| **Architecture decides, scored on the owner's criteria** | fast, defensible choice | the owner gives up a Java-like stack |

## Decision

- The stack is architecture's decision.
- Closeness to Java is a preference, not mandatory.
- Prefer what is easier, faster and closer to the infrastructure in use.

## Consequences

- The chosen stack is in ADR 0002.

## Sources

owner conversation, 2026-11-24; engagement notes; master prompt
