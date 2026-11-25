# 0070. No employer or client names in the repository, URL, OAuth app or UI

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

- No employer or client names in the repo, product, docs, URL, OAuth app, database project, wiki pages or commit metadata.
- A CI hygiene job greps for the forbidden names and fails the build.
- New Cloudflare account on a personal email; if a subdomain showed a name, a new domain would be bound.
- Agent avatars on GitHub must not show the employer's logo.
- Member data is fictional.

## Consequences

- Every new service or identity is checked for names before use.

## Sources

owner conversation, 2026-11-24; decisions/infra.md:6-13,73; decisions/visual-identity/spec.md:209; design notes; ci.yml hygiene; decisions/engineering-plan.md:177-180; decisions/infra.md:73; owner conversation, 2026-11-25
