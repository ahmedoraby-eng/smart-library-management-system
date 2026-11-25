# 0180. Reviewer access: own Google = Supervisor, Demo Librarian, Demo Admin; credentials by email only

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** demo
- **Deciders:** UX, approved by Ahmed Oraby

## Context

Reviewers must try borrowing and admin without an account we create for them, and without a way to escalate.

## Options considered

| Option | For | Against |
|---|---|---|
| **Three ways in, no role switcher** | full tour, safe | shared demo passwords |
| Role switcher in the UI | easiest demo | privilege escalation in a public app |
| Cloudflare Access PIN | no code | no shared demo identity |

## Decision

- Own Google account → read-only Supervisor; Demo Librarian for daily operations; Demo Admin for staff and roles.
- Demo credentials go only in the submission email, never in the repo or UI; demo emails use reserved domains.
- README gives the public URL and how to get each role; data reseeds nightly and on the Admin button.

## Consequences

- The question was delegated to UX and architecture, and their proposal accepted.

## Sources

Public: README Demo accounts; wrangler.toml [env.production.vars]

Also from the owner's working notes and conversations (not published): backlog/slm-tickets-draft.md:135,164; design notes; owner conversation, 2026-11-24; decisions/architecture.md:292-296,390
