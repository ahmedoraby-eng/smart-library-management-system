# 0082. Validation split: shape in the API, rules in the domain, last line in the database

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** architecture
- **Deciders:** Architecture

## Context

Each layer should check what it owns, and the UI must not be trusted.

## Options considered

| Option | For | Against |
|---|---|---|
| **zod at the API edge, business rules in domain, constraints in Postgres** | defence in depth | rules appear in more than one place |

## Decision

- Shape validation in the API layer with zod.
- Business rules in the domain.
- Last-line guarantees in the database.
- The UI validates with the same schemas for UX only.

## Consequences

- A missed check in one layer is caught by the next.

## Sources

decisions/architecture.md:267
