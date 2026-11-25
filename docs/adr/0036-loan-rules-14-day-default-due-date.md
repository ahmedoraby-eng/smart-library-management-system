# 0036. Loan rules: 14-day default, due date 1–60 days, at most 5 open loans, one open loan per title

- **Status:** Accepted (supersedes [0037](0037-allow-second-open-loan-same-title-non.md))
- **Date:** 2026-11-24
- **Area:** scope
- **Deciders:** Product owner

## Context

Borrowing needs clear, testable limits.

## Options considered

| Option | For | Against |
|---|---|---|
| **Config defaults LOAN_DAYS=14, MAX_ACTIVE_LOANS=5; same title blocked** | reasonable and tested | fixed per deployment |
| No per-member limit | simpler | one member can empty the shelf |

## Decision

- Due date = today + LOAN_DAYS (default 14), editable per loan 1–60 days; quick picks 7/14/21 (0 and 61 → 400).
- A member holds at most MAX_ACTIVE_LOANS (default 5, range 1–50) open loans (`409 LOAN_LIMIT_REACHED`).
- No second open loan of the same title (`409 ALREADY_BORROWED`).
- Borrow needs an ACTIVE member, a non-archived book and a free copy. No fee field.

## Consequences

- Both numbers are environment config.
- An earlier draft allowed a second copy of the same title with a note; it was replaced by this rule.

## Sources

docs/architecture.md; wrangler.toml; PR #9; owner conversation, 2026-11-24; Jira SLM-4; decisions/architecture.md:192; decisions/scope.md:44; decisions/test-strategy.md:64; backlog/slm-tickets-draft.md:105-117; decisions/ux.md:292
