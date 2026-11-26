# 0052. Review flow per PR: architecture on GitHub, UX check for UI, QA on merged main

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** process
- **Deciders:** Ahmed Oraby (owner)

## Context

Agents write the code; independent checks keep quality and design consistent.

## Options considered

| Option | For | Against |
|---|---|---|
| **Each role checks its part before and after merge** | independent review | each PR waits for reviewers |

## Decision

- Product owner refines; engineering implements on a story branch.
- Architecture reviews layers, security and data integrity on GitHub; depth by risk (high for auth, transactions, reset and the AI validator; medium for polish and docs; light for small changes).
- UX checks changed screens at 1280/1440/1920 against the UX spec; findings are Must/Should/Nit.
- After green CI and approvals, coordination squash-merges; QA tests merged main against every AC and posts PASS or defects on the ticket.

## Consequences

- SLM-4, SLM-8 and SLM-9 carry a named architecture review before Done.

## Notes

**Amended by [0185](0185-qa-tests-pr-before-merge.md)** (in force since 2026-11-25): QA tests the PR before the merge, not merged `main`; the merge waits for Ready for Release.

## Sources

Public: docs/decisions.md

Also from the owner's working notes and conversations (not published): Confluence page 19365889; owner conversation, 2026-11-24; decisions/engineering-plan.md:24-34; Jira SLM-4; Jira SLM-8; Jira SLM-9; Confluence page 19333121; backlog/slm-tickets-draft.md:36,203; owner conversation, 2026-11-25; Jira SLM-1
