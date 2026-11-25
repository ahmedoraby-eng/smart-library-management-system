# 0096. Deleting a book is Admin only

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** security
- **Deciders:** Product owner, architecture review

## Context

An early story said 'Librarian or Admin delete'; the brief gives Librarians add and edit only.

## Options considered

| Option | For | Against |
|---|---|---|
| **BOOK_DELETE for Admin only** | destructive actions stay with Admin | Librarians can't remove books |
| Librarian can delete | fewer hand-offs | destructive action for more people |

## Decision

BOOK_DELETE is Admin-only; Librarians create and edit books but can't delete or archive them. The story text was corrected.

## Consequences

- The delete button is hidden for Librarians and the API refuses with 403.

## Sources

Public: docs/architecture.md Roles table; README features

Also from the owner's working notes and conversations (not published): decisions/rbac-matrix.md:29; decisions/architecture.md:307,386; Confluence page 19365918; Jira SLM-1
