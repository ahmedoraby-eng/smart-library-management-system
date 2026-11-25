# 0033. No settings screen; configuration lives in environment variables

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** scope
- **Deciders:** Product owner

## Context

Nothing in the app needs runtime settings.

## Options considered

| Option | For | Against |
|---|---|---|
| **Config via environment variables only** | saves a screen and its tests | changes need a deploy |
| Admin settings screen | runtime changes | more UI, tests and risk |

## Decision

- No Admin settings screen. Administration is only 'Staff users'.
- Limits such as LOAN_DAYS, MAX_ACTIVE_LOANS and DUE_SOON_DAYS are environment config.

## Consequences

- Changing a limit is a config change and a redeploy.

## Sources

decisions/scope.md:48; decisions/ux.md:69,206
