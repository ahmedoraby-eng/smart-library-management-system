# 0130. Sign-in: Google first, demo form second, one generic error message

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** ux
- **Deciders:** UX

## Context

SSO is the real path; demo accounts are for reviewers. Errors must not reveal which emails exist.

## Options considered

| Option | For | Against |
|---|---|---|
| **Google button primary and focused; demo form under a divider** | right priority; no account probing | two paths on one page |

## Decision

- [Sign in with Google] full width, focus starts on it; 'or use a demo account' form below, shown only when demo accounts are enabled.
- Wrong email or password: 'Email or password is incorrect.'; after 5 tries a minute a 429 countdown.
- USER_DISABLED, Google failure and unverified email each have fixed copy; the password is cleared, the email kept.

## Consequences

- Laid out as an index card in the Reading Room theme.

## Sources

Public: web/src/

Also from the owner's working notes and conversations (not published): decisions/ux.md:28,52-64; Confluence page 19169290; decisions/ux.md:57-64; Jira SLM-8
