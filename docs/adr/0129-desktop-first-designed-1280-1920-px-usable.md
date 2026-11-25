# 0129. Desktop-first: designed for 1280–1920 px, usable down to 768 px

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** ux
- **Deciders:** UX

## Context

Library staff work at desktop screens.

## Options considered

| Option | For | Against |
|---|---|---|
| **Desktop-first with defined breakpoints** | fits the real use | phones only basic |

## Decision

- Verified at 1280, 1440 and 1920 px.
- Below 1280 the sidebar becomes a 64 px icon rail and the Borrow summary moves below the form; below 1024 tables hide secondary columns; no horizontal page scroll at ≥ 768.

## Consequences

- Extra columns such as ISBN appear from 1440 px.

## Sources

Public: web/src/

Also from the owner's working notes and conversations (not published): decisions/ux.md:26,212-216; Confluence page 19169290; Confluence page 19333121
