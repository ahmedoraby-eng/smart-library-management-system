# 0133. User card shows a role chip and a 'Demo' tag

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** ux
- **Deciders:** UX

## Context

Reviewers switch between demo roles and must see who they are.

## Options considered

| Option | For | Against |
|---|---|---|
| **Name, email, role chip, Demo tag in the sidebar foot** | always visible | small space |

## Decision

The card shows name, email, role chip (Supervisor with a 'Read-only' tooltip) and a neutral 'Demo' tag for demo accounts (`isDemo` from `/api/me`); its menu has Sign out.

## Consequences

- No role switcher exists.

## Sources

Public: web/src/

Also from the owner's working notes and conversations (not published): decisions/ux.md:46; Confluence page 19169290; Jira SLM-7
