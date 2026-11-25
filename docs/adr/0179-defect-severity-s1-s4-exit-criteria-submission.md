# 0179. Defect severity S1–S4 and exit criteria for submission

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** testing
- **Deciders:** QA

## Context

The go/no-go needs clear rules.

## Options considered

| Option | For | Against |
|---|---|---|
| **Four severities; 0 open S1 and 0 open S2 on P0 to ship** | clear go/no-go | severity calls can be argued |

## Decision

- S1 = data integrity, security or a broken P0; then S2–S4.
- Exit: 0 open S1, 0 open S2 on P0, named tests green on the deployed commit, README check, RTM P0 Verified.
- Defects go in `evidence/defects.md` (no new Jira issues without the owner's approval).

## Consequences

- QA gives the go/no-go on Friday morning.

## Sources

decisions/test-strategy.md:191-194
