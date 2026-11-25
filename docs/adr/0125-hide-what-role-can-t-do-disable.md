# 0125. Hide what the role can't do; disable what the data forbids, with a reason

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** ux
- **Deciders:** UX

## Context

Users must understand why an action isn't available.

## Options considered

| Option | For | Against |
|---|---|---|
| **Hidden for role, disabled with reason for data** | clear and honest UI | two rules to apply |

## Decision

- Actions the role can't use are hidden (and refused by the API with 403).
- Actions the data blocks now (0 copies, inactive member) are disabled with a visible reason (API 409).
- A Supervisor deep link to a forbidden page gets /403.

## Consequences

- The API enforces both cases.

## Sources

decisions/ux.md:20,74; Confluence page 19169290
