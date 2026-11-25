# 0001. Record architecture decisions as ADRs

- **Status:** Accepted
- **Date:** 2026-11-25
- **Deciders:** Ahmed Oraby (owner), architecture review

## Context

Decisions were spread across the README, `docs/architecture.md` (a 16-row table) and `docs/ai.md`. Several changed within two days (database, sign-in, retrieval, deploy). A reader couldn't tell what is current, what was replaced, or why.

## Options considered

| Option | For | Against |
|---|---|---|
| A. Keep the table in `docs/architecture.md` | short, one place | no history, no options, no record of what was replaced |
| **B. One short ADR per decision + a register** | history, options and trade-offs kept; superseded decisions stay readable | a few more files |

## Decision

One file per significant decision in `docs/adr/NNNN-title.md`, MADR-lite: status, date, context, options considered, decision, consequences. [`docs/decisions.md`](../decisions.md) is the register. A decision that is replaced keeps its file, with status **Superseded by NNNN**. An ADR is never edited to change its meaning; a new ADR replaces it.

## Consequences

- A new decision gets a number and a row in the register in the same PR that makes it.
- `docs/architecture.md` describes the system as it is, and links here for the reasons.
