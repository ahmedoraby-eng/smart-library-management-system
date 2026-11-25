# 0121. Book add/edit is a full page; member add/edit is a modal

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** ux
- **Deciders:** UX

## Context

Books have about 10 fields; members have 4.

## Options considered

| Option | For | Against |
|---|---|---|
| **Page for books, modal for members** | room and a URL for books; context kept for members | two patterns |
| Drawer for books | stays in context | too cramped |

## Decision

- `/books/new`, `/books/:id/edit`: single column, max 720 px.
- Member add/edit: a 4-field modal.

## Consequences

- Unsaved-changes confirm on the book page.

## Sources

Confluence page 19169290; decisions/ux.md:17,70-71
