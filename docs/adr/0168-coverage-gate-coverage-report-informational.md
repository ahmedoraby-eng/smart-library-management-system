# 0168. No coverage gate; coverage report is informational

- **Status:** Superseded by [0162](0162-same-ci-gates-shared-playbook-90-coverage.md)
- **Date:** 2026-11-24
- **Area:** testing
- **Deciders:** QA

## Context

The first test strategy judged that evaluators look at a working core, not a percentage.

## Options considered

| Option | For | Against |
|---|---|---|
| **Informational coverage only** | no low-value tests | no floor on untested code |

## Decision

No whole-repo coverage gate; the report was informational.

## Consequences

- Replaced on 25/11 by the 90 % coverage gate.

## Sources

decisions/test-strategy.md:16,175
