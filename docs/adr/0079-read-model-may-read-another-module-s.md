# 0079. A read model may read another module's table by name in raw SQL

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** architecture
- **Deciders:** Architecture

## Context

Catalog's book view needs loan facts, but modules must not import each other's schema.

## Options considered

| Option | For | Against |
|---|---|---|
| **Raw-SQL LEFT JOIN LATERAL on `loans` from catalog's read model** | one query, nothing stored | coupling the lint can't see |
| Move the aggregate to a database view both modules own | explicit contract | one more object to migrate |

## Decision

Catalog's BookView reads the loans table by name in raw SQL. Loans column names must stay stable; if more coupling appears, move it to a shared view.

## Consequences

- dependency-cruiser can't detect this coupling; reviews must.

## Sources

PR #2; design notes
