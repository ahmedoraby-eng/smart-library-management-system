# 0137. Shared in-house UI primitives and one pattern for every state

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** ux
- **Deciders:** UX, product owner

## Context

Many agents build screens in parallel; they need the same parts.

## Options considered

| Option | For | Against |
|---|---|---|
| **Build primitives first; no third-party UI library** | consistent look and states | we maintain them |
| Third-party UI library | ready-made | new dependency, generic look |

## Decision

- Primitives: Button (one primary per view), Input, Select, Combobox (ARIA, 200 ms debounce, max 8 options), Badge, Table, Card, Modal/ConfirmDialog (480 px), Toast (4 s, errors persist, max 3), EmptyState, Skeleton, Notice, Pagination (20 per page).
- Every list, form and action has loading, empty, failed and success states; one confirm pattern names the object and the effect.
- List filters live in the URL; 403 → /403; 404 copy per entity.

## Consequences

- New components must look right in both themes.

## Sources

decisions/ux.md:133-146; PR #11; commit 577649e; design notes; decisions/architecture.md:164; decisions/traceability.md:42; Jira SLM-7; Confluence page 19169290; decisions/ux.md:152
