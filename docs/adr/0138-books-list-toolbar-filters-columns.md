# 0138. Books list: toolbar filters and columns

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** ux
- **Deciders:** UX

## Context

The books list is the most-used screen.

## Options considered

| Option | For | Against |
|---|---|---|
| **Search, category, availability, sort, Add book; one visible action + overflow** | everything on one line | many columns |

## Decision

Toolbar: search (title/author/ISBN/publisher), category, availability, sort, Add book. Columns include cover, availability badge, Borrow + overflow menu; a result line with Clear filters.

## Consequences

- ISBN shows from 1440 px.

## Sources

decisions/ux.md:161-164
