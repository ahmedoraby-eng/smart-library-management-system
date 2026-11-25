# 0165. Concurrency race tests are release gates

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** testing
- **Deciders:** QA, engineering

## Context

Two librarians taking the last copy is the core risk of the app.

## Options considered

| Option | For | Against |
|---|---|---|
| **Parallel tests on separate connections** | proves the guarantee | slower tests |

## Decision

- 20 parallel borrows of a 3-copy book by 20 members → exactly 3 × 201 and 17 × 409.
- Also: same-member race, double return, borrow + return, loan-limit race (8 borrows, limit 5), member-suspend race in both orders, two Admins demoting each other.
- Repeated in CI; run once against Neon via Hyperdrive.

## Consequences

- Any change to circulation must keep these green.

## Sources

decisions/test-strategy.md:43-51; decisions/architecture.md:218; decisions/engineering-plan.md:70; Confluence page 19333121; Jira SLM-4
