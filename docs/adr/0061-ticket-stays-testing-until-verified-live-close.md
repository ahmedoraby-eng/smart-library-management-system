# 0061. A ticket stays In Testing until verified live; no close on a workaround

- **Status:** Accepted
- **Date:** 2026-11-25
- **Area:** process
- **Deciders:** Coordination, approved by Ahmed Oraby

## Context

Google sign-in code was merged, but no OAuth client existed yet.

## Options considered

| Option | For | Against |
|---|---|---|
| **Keep SLM-8 In Testing until real sign-in is checked on the live site** | honest status | the board shows one open story |

## Decision

SLM-8 stays In Testing until the OAuth client exists and Google sign-in is checked on the live site.

## Consequences

- The same rule applies to any ticket whose goal isn't met yet.

## Sources

Public: docs/decisions.md

Also from the owner's working notes and conversations (not published): Jira SLM-8
