# 0135. Accessibility target WCAG 2.2 AA in both themes

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** ux
- **Deciders:** UX

## Context

A staff tool must work by keyboard and for low vision.

## Options considered

| Option | For | Against |
|---|---|---|
| **AA contrast, full keyboard use, visible focus** | inclusive; testable with axe | limits colour choices |

## Decision

- AA contrast in both themes (ratios computed; neutral-400 never used for text, placeholders use neutral-500).
- Full keyboard use, 2 px focus outline never removed, focus trap in modals, landmarks, `aria-live` for AI results, `role=alert` for errors.

## Consequences

- An axe scan of 5 screens is part of the manual checks.

## Sources

Public: web/src/

Also from the owner's working notes and conversations (not published): Confluence page 19169290; Jira SLM-7; decisions/ux.md:115-117
