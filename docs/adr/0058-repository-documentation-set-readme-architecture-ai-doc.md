# 0058. Repository documentation set: README, architecture, AI doc, ADRs

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** process
- **Deciders:** Architecture, approved by Ahmed Oraby

## Context

Reviewers read the repo first; docs must be short and match the code.

## Options considered

| Option | For | Against |
|---|---|---|
| **A few repo docs + ADR register** | close to the code | must be kept in sync |
| Heavy documentation | complete | over-documented, drifts |

## Decision

- README: what it is (staff-facing, our interpretation), live URL, quick start with `demo:local`, demo accounts, 5-minute tour, features mapped to minimum/bonus, config table, tests.
- `docs/architecture.md` (diagram, layers, RBAC table, key decisions), `docs/ai.md`, ADRs with a register.
- Demo passwords come with the submission, never from the repo.

## Consequences

- Every new decision gets an ADR in the same PR.

## Sources

PR #16; design notes; owner conversation, 2026-11-24; master prompt
