# 0178. AI quality check: 10 fixed queries; pass if every book is real and ≥ 7 of 10 make sense

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** testing
- **Deciders:** QA

## Context

A small model's ranking quality can't be proven by unit tests.

## Options considered

| Option | For | Against |
|---|---|---|
| **Manual real-model run on canned queries** | measures real quality | subjective scoring |

## Decision

Ten fixed queries (incl. vague, off-topic and injection) run on the real model; results in `evidence/ai-quality.md`. Pass = every returned book is real and at least 7 of 10 results are sensible; product owner and QA score.

## Consequences

- A fail would trigger the Claude Haiku option (ADR 0014).

## Sources

decisions/test-strategy.md:153; decisions/engineering-plan.md:150
