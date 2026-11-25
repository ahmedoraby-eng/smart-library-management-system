# 0075. REST API under /api; every route needs staff auth except health and auth

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** architecture
- **Deciders:** Architecture

## Context

The API contract must be explicit and testable with curl.

## Options considered

| Option | For | Against |
|---|---|---|
| **REST + JSON, UUID ids** | visible contract | more endpoints to write |
| RPC server functions | typed calls | blurs the API boundary |

## Decision

- Base `/api`, JSON bodies, UUID ids.
- Every route is authenticated except `GET /api/health` and `/api/auth/*`.
- Each route has one declared permission.

## Consequences

- The RBAC matrix test lists every route.

## Sources

Public: docs/architecture.md

Also from the owner's working notes and conversations (not published): decisions/architecture.md:224-243
