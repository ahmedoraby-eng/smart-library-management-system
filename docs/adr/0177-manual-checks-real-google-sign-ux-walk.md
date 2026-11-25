# 0177. Manual checks: real Google sign-in, UX walk, axe scan, README on a clean clone

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** testing
- **Deciders:** QA

## Context

Some things can't be automated cheaply.

## Options considered

| Option | For | Against |
|---|---|---|
| **A short manual list with evidence** | covers what automation can't | manual effort before submission |

## Decision

- Real Google sign-in on the live URL; UX walk at 1280/1440 + one 375 px smoke; axe scan on 5 screens (serious/critical block); README followed on a clean clone.
- Not tested: every form field in E2E, cross-browser, responsive beyond the 375 px smoke.

## Consequences

- Results go into the evidence folder.

## Sources

decisions/test-strategy.md:150-157; decisions/test-strategy.md:148
