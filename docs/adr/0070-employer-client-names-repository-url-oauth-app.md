# 0070. No employer or client names in the working tree, URL, OAuth app or UI

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** repo
- **Deciders:** Ahmed Oraby (owner)

## Context

SLM is a personal assessment in a public repo; it must not expose the owner's employer or its clients.

## Options considered

| Option | For | Against |
|---|---|---|
| **Reuse accounts only where no name shows; CI fails on the names** | fast, and checked automatically | needs care on every new account |
| New accounts for everything from scratch | clean | slow |

## Decision

- No employer or client names in the **working tree**: code, UI, docs, URL, OAuth app, database project and the wiki pages written for the assessment. A CI hygiene job greps the working tree for the forbidden names and fails the build; it does not read git history, author names or branch names.
- **Commit metadata is not covered**, by the owner's decision of 2026-11-25. Commits made by the agents' GitHub Apps show those Apps' names; some commits show the owner's work address or his personal address; agent branch names stay. The history is kept as it is, and the repository becomes private after the assessment:

  > Ahmed Oraby, 2026-11-25: «هنسيبه زي ما هو، هنسيب الوضع زي ما هو، مش هنغير حاجة، بابليك وكل حاجة … بعد ما يخلصوا نعمله برايفت»
- A new Cloudflare account on a personal email; if a subdomain showed a name, a new domain would be bound.
- Agent avatars on GitHub must not show the employer's logo.
- Member data is fictional.

## Consequences

- Every new service or identity is checked for names before use.
- The rule is true for the working tree and the published app; it is not true for the git history, which a reader of the public repository can see until it turns private. [0069](0069-neutral-github-app-identity-agent-commits.md) (a neutral App) was rejected for the same reason.

## Sources

Public: .github/workflows/ci.yml (hygiene job)

Also from the owner's working notes and conversations (not published): owner conversation, 2026-11-24; decisions/infra.md:6-13,73; decisions/visual-identity/spec.md:209; design notes; ci.yml hygiene; decisions/engineering-plan.md:177-180; decisions/infra.md:73; owner conversation, 2026-11-25
