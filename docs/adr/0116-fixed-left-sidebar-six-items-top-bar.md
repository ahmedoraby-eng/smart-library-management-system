# 0116. Fixed left sidebar with six items; no top bar

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** ux
- **Deciders:** UX

## Context

Staff use the app all day; every screen should be one click away.

## Options considered

| Option | For | Against |
|---|---|---|
| **240 px sidebar, icon rail under 1280 px, user menu at its foot** | everything in reach | less horizontal space |
| Top bar | common | 64 px that buys nothing |

## Decision

- Items: Dashboard, Books, Members, Circulation, Loan history, Book discovery, plus Staff users for Admin below a divider.
- No top bar; sign-out in the user card at the sidebar foot.
- /403 and /404 render inside the shell; every screen within 2 clicks.

## Consequences

- New screens must fit the sidebar.

## Sources

decisions/ux.md:11; Confluence page 19169290; Jira SLM-7; owner conversation, 2026-11-24; decisions/architecture.md:163,167,240; backlog/slm-tickets-draft.md:61-69
