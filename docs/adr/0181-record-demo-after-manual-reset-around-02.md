# 0181. Record the demo after a manual reset, never around 02:00 Cairo; warm the app first

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** demo
- **Deciders:** QA, engineering

## Context

The nightly reset and Neon cold start could spoil a recording.

## Options considered

| Option | For | Against |
|---|---|---|
| **Reset, warm up, then record** | clean, fast demo | a manual step |

## Decision

Open the app once before recording; record after a manual reset; on Friday morning reseed, run the deep smoke and warm Neon. Never record around the 02:00 Cairo reset.

## Consequences

- Same steps before submission.

## Sources

decisions/architecture.md:344; decisions/test-strategy.md:210; decisions/engineering-plan.md:154
