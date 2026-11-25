# 0172. RBAC matrix test covers every role × every route and fails on a missing row

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** testing
- **Deciders:** QA

## Context

A new endpoint must not ship unprotected.

## Options considered

| Option | For | Against |
|---|---|---|
| **Table generated from the router's route list** | new routes can't be forgotten | test needs updating per route |
| Hand-copied matrix | simple | drifts from the code |

## Decision

- The test imports the router's endpoints and fails if a route has no row or a row has no route; 104 checks in all, including a 401 case per endpoint.
- The matrix in the test is a copy of the RBAC decision; no test reads a document.

## Consequences

- Every new route needs a row in `api/test/rbac-matrix.test.ts`.

## Sources

Public: api/test/

Also from the owner's working notes and conversations (not published): Confluence page 19333121; Jira SLM-8; decisions/test-strategy.md:76-77; design notes
