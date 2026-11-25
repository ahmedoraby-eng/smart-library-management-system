# 0066. Branch, commit and PR names carry the SLM key; 'Refs' vs 'Closes'

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** repo
- **Deciders:** Engineering, architecture review

## Context

Links between code and tickets must be automatic and readable.

## Options considered

| Option | For | Against |
|---|---|---|
| **Key in branch, commit and PR title; Closes only on the final PR** | traceable; drives the close automation | naming discipline |

## Decision

- Branch `<agent>/SLM-<n>-<slug>`; commits `SLM-<n>: …`; PR title starts with the key.
- Intermediate PRs say `Refs SLM-n`; only the PR that completes the ACs says `Closes SLM-n`.
- PR template: What and why / Jira / Checks, and ACs mapped to tests.
- Commit trailers carry the owner's name only, no email, in the public repo.

## Consequences

- ADR 0023 acts on the Closes line.

## Sources

PR #6; .github/pull_request_template.md; design notes; commit a06c8a1; Confluence page 19365889; decisions/engineering-plan.md:12,173-174,189
