# 0062. Public repository on the owner's personal GitHub account

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** repo
- **Deciders:** Ahmed Oraby (owner)

## Context

The assessment expects a public repo, and the work must not sit in an employer organisation.

> Ahmed Oraby: «يكون على جيت هاب البيرسونال اكونت بابليك ريبو، على البيرسونال اكونت بتاعي»

## Options considered

| Option | For | Against |
|---|---|---|
| **Public repo `ahmedoraby-eng/smart-library-management-system`** | neutral and personal | agents need app access to a personal repo |
| Organisation-owned repo | existing access | shows an employer |

## Decision

- Public repo `smart-library-management-system` on the owner's personal account.
- The owner creates it himself; agents commit and push through their GitHub Apps.
- No secrets and no employer assets in it.

## Consequences

- Workers Builds is installed on the personal account for this one repo.

## Sources

Public: docs/decisions.md

Also from the owner's working notes and conversations (not published): owner conversation, 2026-11-24; engagement notes; master prompt; design notes; Jira SLM-6; Confluence page 19333121
