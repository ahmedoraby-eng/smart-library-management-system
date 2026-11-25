# 0027. Members are records only: no login, never deleted

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** scope
- **Deciders:** Product owner

## Context

Staff users and library members are different things. History must survive member changes.

## Options considered

| Option | For | Against |
|---|---|---|
| **Member is a record; staff users are the only accounts** | clear split of auth and patrons; history kept | no member portal |
| Delete members | simpler list | loses loan history |

## Decision

- A member has no password, login or role.
- Members are created, edited, deactivated and reactivated, never deleted.
- `member_number` comes from a database sequence (M-000001).
- Email is unique, case-insensitive (`409 DUPLICATE_EMAIL`).

## Consequences

- Inactive members stay in lists and history.
- User and Member are never merged.

## Sources

Public: README; PR #7

Also from the owner's working notes and conversations (not published): decisions/architecture.md:182; decisions/scope.md:8-9,56; Confluence page 19398657; Jira SLM-3; master prompt; backlog/slm-tickets-draft.md:97-106; decisions/architecture.md:196; decisions/scope.md:43
