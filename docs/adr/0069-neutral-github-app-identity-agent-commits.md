# 0069. A neutral GitHub App identity for agent commits

- **Status:** Proposed
- **Date:** 2026-11-24
- **Area:** repo
- **Deciders:** DevOps

## Context

Agent commit identities show the employer's name in a public repo.

## Options considered

| Option | For | Against |
|---|---|---|
| **One new neutral App installed on this repo only** | hides the name in commit authors | one more identity to manage |
| Owner pushes everything | no new identity | owner becomes a bottleneck |

## Decision

Recommended: create one neutral GitHub App for this repo only. Waiting for the owner's answer.

## Consequences

- Until then, existing App identities are used and their avatars must not show the employer's logo.

## Sources

handover notes; decisions/infra.md:87-88
