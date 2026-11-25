# 0086. Front end: no global state library; react-hook-form + zod; in-house components

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** stack
- **Deciders:** Architecture

## Context

The UI is mostly server data and forms.

## Options considered

| Option | For | Against |
|---|---|---|
| **TanStack Query for server state, react-hook-form + zod, copied-in Radix/shadcn-style parts** | few dependencies | we own the components |
| Global state library | central store | not needed |

## Decision

- React 18 + TypeScript + Vite + Tailwind.
- Server state in TanStack Query; forms with react-hook-form + zod.
- Components copied in (Radix/shadcn style); no UI library dependency; no global state library.

## Consequences

- Shared primitives are listed in the UX ADR on UI primitives.

## Sources

decisions/architecture.md:118
