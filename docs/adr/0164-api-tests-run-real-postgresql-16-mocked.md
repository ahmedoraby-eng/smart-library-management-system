# 0164. API tests run on real PostgreSQL 16, never a mocked database

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** testing
- **Deciders:** QA

## Context

The concurrency and constraint guarantees live in the database engine.

## Options considered

| Option | For | Against |
|---|---|---|
| **Real Postgres: embedded locally, service container in CI** | proves races and constraints for real | slower than mocks |
| Mock or SQLite for integration | fast | can't prove locks or CHECKs |

## Decision

- Vitest API and contract suites run against real Postgres 16 (embedded locally, `TEST_DATABASE_URL` in CI).
- Web tests use Vitest + Testing Library (jsdom).
- Reached 327 API tests with 93.9 % statements before the coverage backfill.

## Consequences

- A full local run goes through a machine lock to avoid port clashes.

## Sources

Public: README Tests; commit cb7d6a2

Also from the owner's working notes and conversations (not published): Confluence page 19333121; design notes; owner conversation, 2026-11-24
