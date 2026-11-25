# 0144. Due-soon window is 2 days (DUE_SOON_DAYS), one constant everywhere

- **Status:** Accepted (supersedes [0145](0145-due-soon-window-3-days.md))
- **Date:** 2026-11-24
- **Area:** ux
- **Deciders:** Product owner, approved by Ahmed Oraby

## Context

The ticket said 3 days, while the UX spec and the code used 2.

## Options considered

| Option | For | Against |
|---|---|---|
| **2 days, one constant next to LOAN_DAYS** | matches spec and code | short warning |

## Decision

`DUE_SOON_DAYS` = 2, in one place (a web constant in `web/src/lib/loanStatus.ts`); badges read 'Due in n days' / 'Due today'.

## Consequences

- If 3 is wanted later, it is one constant.

## Sources

Public: README Features; PR #11; PR #13

Also from the owner's working notes and conversations (not published): owner conversation, 2026-11-24; decisions/ux.md:295; decisions/scope.md:51; Jira SLM-13
