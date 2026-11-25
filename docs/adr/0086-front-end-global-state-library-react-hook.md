# 0086. Front end: no global state library; zod-validated forms; in-house components

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** stack
- **Deciders:** Architecture

## Context

The UI is mostly server data and forms.

## Options considered

| Option | For | Against |
|---|---|---|
| **TanStack Query for server state, forms validated with the shared zod schemas, copied-in Radix/shadcn-style parts** | few dependencies | we own the components |
| Global state library | central store | not needed |

## Decision

- React 19 + TypeScript + Vite + Tailwind.
- Server state in TanStack Query; forms validated with the shared zod schemas (no form library).
- Components copied in (Radix/shadcn style); no UI library dependency; no global state library.

## Consequences

- Shared primitives are listed in the UX ADR on UI primitives.

## Sources

Public: docs/architecture.md

Also from the owner's working notes and conversations (not published): decisions/architecture.md:118
