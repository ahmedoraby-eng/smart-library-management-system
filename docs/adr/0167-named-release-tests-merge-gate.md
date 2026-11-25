# 0167. Named release tests are the merge gate

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** testing
- **Deciders:** QA

## Context

A percentage alone invites low-value tests; the risky behaviours must be named.

## Options considered

| Option | For | Against |
|---|---|---|
| **A fixed list of named tests that must run and pass** | targets the real risks | the list must be maintained |

## Decision

Gate: inventory-invariant, concurrency-20-on-3, duplicate-return, inactive-member, loan-limit, member-suspend-race, rbac-matrix, no-auth-bypass, session-cookie-flags, unknown-google-is-supervisor-readonly, demo-accounts-protected, reset-keeps-inventory-valid. These tests run in every CI run; the gate is a review convention (a reviewer checks they ran), not enforced by a CI check.

## Consequences

- The coverage gate added later sits next to this list, not instead of it.

## Sources

Public: api/test/

Also from the owner's working notes and conversations (not published): decisions/test-strategy.md:16,179
