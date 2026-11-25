# 0143. Dashboard: four KPI cards, availability bar, recent borrowings, popular and recently added

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** ux
- **Deciders:** UX, product owner

## Context

The brief lists seven KPIs; the dashboard should stay calm.

## Options considered

| Option | For | Against |
|---|---|---|
| **Seven KPIs folded into four cards plus three short lists** | complete and calm | less detail per number |

## Decision

- Cards: Catalog, Available copies (stacked bar with legend), Active loans (+ overdue badge and link), Active members; available + borrowed = total.
- Lists: 8 most recent borrowings (overdue tint), top 5 popular books by loans in the last 30 days, 3 most recently added.
- Archived books excluded. Supervisor sees the same without action buttons; header Return/Borrow buttons need LOAN_PROCESS.

## Consequences

- The first ticket capped every widget at 5 items; recent borrowings settled at 8.

## Sources

Public: PR #3; README Features

Also from the owner's working notes and conversations (not published): Jira SLM-12; Confluence page 19169290; owner conversation, 2026-11-24; decisions/ux.md:156-158; decisions/ux.md:297; backlog/slm-tickets-draft.md:173-185
