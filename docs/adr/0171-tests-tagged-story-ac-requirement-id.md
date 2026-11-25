# 0171. Tests are tagged by story, AC and requirement id

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** testing
- **Deciders:** QA

## Context

Evidence for the RTM shouldn't be typed twice.

## Options considered

| Option | For | Against |
|---|---|---|
| **Test titles 'SLM-n ACn' + @R- tags; an evidence script** | RTM evidence generated | naming discipline |
| Manual spreadsheets | no tooling | typed twice, drifts |

## Decision

Titles start with story + AC and an @R- tag; `scripts/test-evidence.ts` writes `evidence.json` and `rtm-evidence.md`; a row is Verified only when CI is green on the merged commit.

## Consequences

- The orphan check is advisory.

## Sources

Public: api/test/

Also from the owner's working notes and conversations (not published): decisions/test-strategy.md:13,159-168; decisions/engineering-plan.md:170
