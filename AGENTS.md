# AGENTS.md — Smart Library Management System

Working rules for AI coding agents (and people) in this repository. Read this first. Product and setup details are in
`README.md`, `docs/architecture.md` and `docs/ai.md`.

## What this is

A staff-facing library app: catalogue, members, Borrow Book / Return Book, loan history, search, a dashboard and
AI-assisted discovery. Hono on Cloudflare Workers (`api/`), React + TanStack Router/Query (`web/`), shared Zod contracts
(`contracts/`), PostgreSQL 16 (`migrations/`).

**This repository is public.** Never commit secrets, real personal data, or the names of any employer, client or team:
the `hygiene` CI job scans for secrets and for forbidden names and fails the PR.

## Commands

- `npm ci`: install (Node 22 in CI, 20 or newer locally)
- `npm run demo:local`: the app with demo data, no Docker needed
- `npm run check`: typecheck, dependency rules, lint, format check, build. **Must pass before every PR.**
- `npm run test:coverage`: API + contracts tests on PostgreSQL 16, then the web tests, with the coverage gate
  (lines, statements and functions 90%; branches 85% for the API, 80% for the web app). The thresholds are in
  `vitest.config.ts` and `web/vitest.config.ts`: never lower them.
- `npm run format`: Prettier. Run it instead of formatting by hand.
- `npm run e2e`: the local Playwright smoke test.

## CI gates (every PR)

- **ci**: hygiene (secret scan, forbidden names), then the shared Node CI: `npm run check`, `npm run test:coverage` and
  an audit of production dependencies.
- **AI guardrails** (`.ai-guard.toml`):
  - an AI-assisted PR ticks the AI-assistance box in the PR template;
  - when it changes source (`api/src`, `web/src`, `contracts/src`) it adds or updates tests;
  - when it changes a protected path (`.github/workflows/`, `.ai-guard.toml`, `migrations/`) it needs the
    `reviewed-by-ahmed` label, which only the repository owner adds after a line-by-line review.
- **Migrations gate**: a PR that adds or changes a file under `migrations/` fails until the migration has been run on
  production by hand and the PR has the label `migrations-applied`. Merging deploys at once, so the database must be
  ready first.

Agents never push workflow files, change repository secrets or add the owner's labels.

## Pull requests

- One task per PR, branched from an up-to-date `main`. Keep it small (the AI guardrails warn above about 400 changed
  lines).
- The PR title and the branch name carry the Jira key (`SLM-<n>`).
- In the description, an intermediate PR says `Refs SLM-<n>`. Only the final PR, the one that completes the acceptance
  criteria, says `Closes SLM-<n>`: when it merges, the issue moves to Released with a comment of the PR links.
- Fill in `.github/pull_request_template.md` and tick the AI-assistance box honestly.
- A bug fix comes with a test that fails without the fix.

## Review conversation (required)

Every review and every comment gets a written answer, so each PR and each ticket has a clear history.

1. **Review findings.** Reply on the PR, in its conversation, from your own account: one reply per review, with one line
   per finding. Each line says what you did and the commit SHA, or why you did not do it. Post the reply before asking
   for a re-review.
2. **Jira comments.** Every comment addressed to you on a ticket gets a reply on that ticket.
3. **Closing.** When the work is done, add a closing comment on the Jira ticket that links the PR.

## Code map

- `api/src/<module>/{domain,application,infrastructure,api}`: catalog, circulation, members, staff, discovery,
  dashboard; `api/src/platform/`: database, security, config.
- `web/src/features/<module>/`: screens and their API hooks; `web/src/components/ui/`: shared components;
  `web/src/routes/router.tsx`: routes and the shared API error handling.
- `contracts/src/`: request and response schemas shared by the API and the web app.
- `api/test/`: integration tests on real PostgreSQL; web tests sit next to their source (`*.test.tsx`).
