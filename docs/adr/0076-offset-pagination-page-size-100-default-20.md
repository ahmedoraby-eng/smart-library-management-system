# 0076. Offset pagination: page size ≤ 100 (default 20), whitelisted sort keys

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** architecture
- **Deciders:** Architecture

## Context

Lists must page and sort safely.

## Options considered

| Option | For | Against |
|---|---|---|
| **Offset paging** | simple, demo-sized | slower on deep pages of big tables |
| Cursor paging | scales | more complex |

## Decision

- Lists return `{items, page, size, total}`; size ≤ 100, default 20.
- Sort keys are whitelisted per resource (e.g. `sort=title,-createdAt`).
- Books list supports q, category, available=true, sort, page and size.

## Consequences

- Revisit if lists get very large.

## Sources

Public: docs/architecture.md

Also from the owner's working notes and conversations (not published): decisions/architecture.md:228,258; decisions/architecture.md:228
