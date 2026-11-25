# 0120. Return asks for confirmation; Borrow doesn't

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** ux
- **Deciders:** UX

## Context

Return changes state with no summary card to look at.

## Options considered

| Option | For | Against |
|---|---|---|
| **Non-destructive confirm dialog for Return** | prevents wrong-row returns | one more click |

## Decision

Return opens 'Return X from Y?' with the return date and overdue days; focus on the action, Enter confirms. A shared ReturnConfirmDialog is used on every screen.

## Consequences

- Borrow relies on its summary card instead.

## Sources

decisions/ux.md:16,260
