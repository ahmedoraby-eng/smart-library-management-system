# 0028. Use 'Borrow Book' and 'Return Book'; never 'check-in/check-out'

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** scope
- **Deciders:** Product owner, approved by Ahmed Oraby

## Context

The assessment says check-in = marked as borrowed and check-out = marked as returned, which is the reverse of common library use.

## Options considered

| Option | For | Against |
|---|---|---|
| **Explicit labels Borrow Book / Return Book** | no ambiguity for users or evaluators | the brief's words don't appear in the UI |
| Use check-in/check-out literally | matches the brief | confusing, reversed meaning |

## Decision

- UI and API use only Borrow Book (`POST /api/loans/borrow`) and Return Book (`POST /api/loans/{id}/return`).
- 'check-in', 'check-out', fees, fines and payments never appear in the UI or API.
- The README explains the mapping once.

## Consequences

- The traceability matrix maps the brief's terms to these labels.
- The Definition of Done checks UI text for the banned words.

## Sources

Public: README.md top note

Also from the owner's working notes and conversations (not published): master prompt; backlog/slm-tickets-draft.md:16; owner conversation, 2026-11-24; Jira SLM-7; Jira SLM-5; decisions/scope.md:12-13; decisions/traceability.md:7,44
