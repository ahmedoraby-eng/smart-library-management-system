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
- Commit trailers name the requester. In practice some trailers and authors carry the owner's personal or work e-mail; by the owner's decision of 2026-11-25 the history is kept as it is (see [0070](0070-employer-client-names-repository-url-oauth-app.md)):

  > Ahmed Oraby, 2026-11-25: «هنسيبه زي ما هو، هنسيب الوضع زي ما هو، مش هنغير حاجة، بابليك وكل حاجة … بعد ما يخلصوا نعمله برايفت»

## Consequences

- ADR 0023 acts on the Closes line.

## Sources

Public: PR #6; .github/pull_request_template.md; commit a06c8a1

Also from the owner's working notes and conversations (not published): design notes; Confluence page 19365889; decisions/engineering-plan.md:12,173-174,189
