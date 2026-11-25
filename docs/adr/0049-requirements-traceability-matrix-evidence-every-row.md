# 0049. Requirements traceability matrix with evidence on every row

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** process
- **Deciders:** Product owner, architecture review

## Context

Reviewers must see that every requirement is met or deliberately left out.

## Options considered

| Option | For | Against |
|---|---|---|
| **RTM: assessment rows first, derived rows second, each with evidence** | auditable | has to be kept current |

## Decision

- Part 1 quotes the assessment (O-1…O-14); Part 2 holds 54 derived rows.
- Statuses Planned → In progress → Done → Verified / Descoped.
- Every row needs an implementation reference and test evidence, or an explicit 'descoped' reason.
- Optional rows are mapped but not mandatory.

## Consequences

- The deploy smoke results are recorded in the RTM.

## Sources

Public: docs/decisions.md

Also from the owner's working notes and conversations (not published): Jira SLM-11; Jira SLM-10; Jira SLM-14; decisions/traceability.md:3-6,27,85-90; decisions/traceability.md:90
