# 0081. Dashboard reuses circulation's loan-status SQL fragment

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** architecture
- **Deciders:** Architecture

## Context

The dashboard's overdue count must match the loan list exactly.

## Options considered

| Option | For | Against |
|---|---|---|
| **Import the pure SQL fragment `loanSql.ts`** | one derivation | a cross-module import |
| Dashboard keeps its own derivation with now() | no import | can disagree with the list |

## Decision

`dashboard/infrastructure` imports `isOverdueSql` / `loanStatusSql` from circulation on the injected clock. Allowed because it is a pure fragment, not a table schema.

## Consequences

- If a third module needs it, move it to `platform/sql/loanStatus.ts`.

## Sources

PR #11; commit b91befa
