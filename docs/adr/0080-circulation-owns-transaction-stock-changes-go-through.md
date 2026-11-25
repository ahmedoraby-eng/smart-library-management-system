# 0080. Circulation owns the transaction; stock changes go through catalog's BookStock port

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** architecture
- **Deciders:** Architecture

## Context

Borrow touches both loans (circulation) and copies (catalog).

## Options considered

| Option | For | Against |
|---|---|---|
| **Catalog owns the stock statements; circulation calls them inside its transaction** | one owner per rule | a port to wire |

## Decision

- `BookStock` port with `PgBookStock` bound to circulation's transaction (`takeCopy` / `returnCopy`); circulation owns only loans.
- Fixed lock order: borrow member → book; return loan → book. Keep it for any future write to avoid deadlocks.

## Consequences

- A new write path must follow the same lock order.

## Sources

Public: PR #8

Also from the owner's working notes and conversations (not published): decisions/architecture.md:151,216
