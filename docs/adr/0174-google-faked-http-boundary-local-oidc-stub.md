# 0174. Google faked at the HTTP boundary with a local OIDC stub

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** testing
- **Deciders:** QA

## Context

CI can't use real Google credentials.

## Options considered

| Option | For | Against |
|---|---|---|
| **Local stub signs ID tokens with a test key and serves JWKS** | no credentials in CI | real Google only checked by hand |
| Real Google in CI | true end to end | needs credentials |

## Decision

A local OIDC stub signs ID tokens with a test key pair and serves JWKS; the CI Google stub is honoured only when ENVIRONMENT=test. Real Google is checked manually on the live URL.

## Consequences

- See the pending live sign-in check.

## Sources

decisions/test-strategy.md:89,136; decisions/engineering-plan.md:91
