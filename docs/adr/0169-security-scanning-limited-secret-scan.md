# 0169. Security scanning limited to the secret scan

- **Status:** Superseded by [0162](0162-same-ci-gates-shared-playbook-90-coverage.md)
- **Date:** 2026-11-24
- **Area:** testing
- **Deciders:** QA

## Context

In the time box, CI ran only gitleaks for security.

## Options considered

| Option | For | Against |
|---|---|---|
| **Secrets only** | fast | no dependency audit, SAST or Dependabot |

## Decision

No npm audit, Dependabot, CodeQL/SAST, pen test or container scan; documented as a gap.

## Consequences

- The playbook gates added a dependency audit on 25/11; SAST and Dependabot remain gaps.

## Sources

Confluence page 19333121
