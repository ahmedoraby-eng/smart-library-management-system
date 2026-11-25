# Smart Library Management System

A staff-facing library operations app: catalogue, members, **Borrow Book** / **Return Book**, loan history, search, a dashboard, and AI-assisted book discovery. Admins, Librarians and Supervisors sign in. Members are records and never sign in.

**Live demo:** `<LIVE_URL>`
**Demo video:** `<VIDEO_URL>`

> **Our interpretation.** The assessment doesn't say whether the app is staff-facing or customer-facing. We chose staff-facing because every required feature is an operator action.
>
> **Terminology.** The assessment says *check-in* means "marked as borrowed" and *check-out* means "marked as returned". To avoid confusion, the app only uses **Borrow Book** (`POST /api/loans/borrow`) and **Return Book** (`POST /api/loans/{id}/return`).

## Quick start

Prerequisite: Node 20 or newer. No Docker needed.

```bash
npm install
npm run demo:local
```

`demo:local` does this, then keeps running until you press Ctrl+C:

1. Starts an embedded PostgreSQL 16 on a free port (it tries 5440 first) with its data in `.pgdata-demo/`.
2. Applies the migrations and loads the demo data (only into an empty catalogue).
3. Creates `.dev.vars` on the first run, with a random session secret and random local demo passwords. The file is git-ignored.
4. Builds the UI and runs the Worker locally on a free port (it tries 8790 first), with the local fake AI model.
5. Prints the URL and the two demo sign-ins (email and password).

### Step by step (with Docker or your own Postgres)

```bash
docker compose up -d db          # or, without Docker: npm run db:local  (keep it running)
npm install
cp .env.example .env && cp .dev.vars.example .dev.vars   # then fill SESSION_SECRET and the two DEMO_*_PASSWORD values (12+ characters)
export DATABASE_URL=postgres://library:library@localhost:5432/library
npm run db:migrate && npm run seed
npm run dev                      # http://localhost:8787
```

`npm run reseed` resets the demo data. There is no auth bypass in any environment.

## Demo accounts

| Who | Role | How to sign in |
|---|---|---|
| Demo Librarian | Librarian: daily operations | Email and password in the "Demo account" form |
| Demo Admin | Admin: also staff management and "Reset demo data" | Email and password in the "Demo account" form |
| Any Google account | Supervisor (read-only) on first sign-in | "Sign in with Google" |

- Locally, the passwords are printed by `npm run demo:local` and stored in `.dev.vars` (`DEMO_LIBRARIAN_*`, `DEMO_ADMIN_*`).
- For the live demo, reviewers receive the demo passwords with the submission. They are never in this repository.
- The "Sign in with Google" button shows only when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set. The demo form shows only when `DEMO_ACCOUNTS_ENABLED=true`.
- The two demo accounts are locked: their role and status can't be changed in the Admin screen.
- The demo data (books, members, loans) is restored every night by a Cron Trigger, and an Admin can reset it at any time. Staff accounts are kept.

## How to try it (5 minutes)

1. Sign in as **Demo Librarian**. The Dashboard shows the totals, overdue loans and recent borrowings.
2. **Books**: search `tolkein` (typo on purpose) or part of an ISBN; filter by category or "available only".
3. **Circulation → Borrow book**: pick a member, pick a book, keep the 14-day due date, confirm. The book's available count drops by one.
4. **Circulation → Return book**: overdue loans are listed first; return one and see it under **Loan history**.
5. **Book discovery**: type what a member wants in plain words (for example "a short novel about friendship for a teenager") and borrow one of the suggestions.
6. Sign in as **Demo Admin** to delete or archive a book, manage staff roles, or "Reset demo data". Sign in with Google to see the read-only Supervisor view.

## Features

Minimum features from the assessment:

- [x] **Add, edit and delete books.** Create and edit with validation (ISBN check digit, no duplicate ISBN among active books, copies can't drop below copies on loan, a version check against lost updates). Delete follows one rule: a book with open loans can't be deleted; a book with only past loans is **archived** (gone from the list, history stays readable); a book that was never borrowed is deleted. Only Admins can delete.
- [x] **Borrow Book (check-in in the assessment's words).** One database transaction: the member row is locked, the rules are checked (member is active, not already holding this title, under the loan limit), one copy is taken with a guarded update, and the loan is written. Default loan is 14 days; a custom due date can be 1 to 60 days ahead.
- [x] **Return Book (check-out in the assessment's words).** One transaction: the loan is closed only if it is still open, and the copy goes back to stock. Returning twice gives a clear 409.
- [x] **Search.** One search box over title, author, category, description, publisher and ISBN, with prefix matching while you type and typo tolerance on title and author. Filters for category and availability; sorting and paging.

Bonus and extras:

- [x] **Single sign-on with roles.** Sign in with Google (OpenID Connect, PKCE) plus two demo accounts. Three roles (Admin, Librarian, Supervisor), enforced by the API on every route. The role is read from the database on every request.
- [x] **AI feature: Smart Book Discovery.** Describe what a member needs in words and get up to 5 real catalogue books with a reason and live availability. Candidates come from **hybrid retrieval**: full-text search plus semantic search over embedded description chunks (Workers AI embeddings, pgvector HNSW), fused with Reciprocal Rank Fusion. The model only ranks and explains those candidates. Daily cost limits step down to cheaper tiers instead of failing, and discovery falls back to keyword ranking when AI is not available. See [docs/ai.md](docs/ai.md).
- [x] **Loan history** with filters (status, member, book, borrowed date range, text) and sorting. Overdue is derived from the due date at read time, never stored.
- [x] **Members.** Create, edit, deactivate and reactivate (no delete); search by name, member number or email; member page with open, overdue and past loans.
- [x] **Dashboard.** Totals (titles, copies, available, borrowed), members, active and overdue loans, the 8 most recent borrowings, top 5 books by loans in the last 30 days, and the 3 most recently added books.
- [x] **Staff management** (Admin only): list staff, change role, disable or enable. Rules: an Admin can't change their own access, the last active Admin can't be demoted or disabled, demo accounts are protected, and an Admin who lost that role mid-request is refused.
- [x] **Due-soon and overdue badges** on loans ("Due in 2 days", "Due today", "Overdue · 3 days"). The due-soon window is 2 days, a constant in `web/src/lib/loanStatus.ts`.
- [x] **ISBN lookup from Open Library** on the Add/Edit Book form: fills title, author, publisher, year, description and cover when found. If the service is slow or down (3 second timeout), the form still works.
- [x] **Nightly demo reset** by a Cloudflare Cron Trigger (00:00 UTC), plus an Admin "Reset demo data" button.
- [x] **Live URL and demo video:** see the links at the top.

## Stack

| Layer | Choice |
|---|---|
| API | TypeScript, [Hono](https://hono.dev) on Cloudflare Workers, modular monolith (`api → application → domain ← infrastructure`) |
| Database | PostgreSQL 16 (Neon in production, reached through Cloudflare Hyperdrive), Drizzle, versioned SQL migrations |
| UI | React, TypeScript, Vite, Tailwind, TanStack Router (typed routes; filters in the URL) and TanStack Query, served by the same Worker (one URL, no CORS) |
| Contracts | zod schemas in `contracts/`, shared by the API and the UI |
| Auth | Sign in with Google (OIDC) in the app, plus two demo staff accounts; HttpOnly session cookie; roles live in our database |
| AI | Hybrid retrieval (Postgres full-text + Workers AI embeddings in pgvector, fused with RRF); a Workers AI model ranks and explains the candidates; deterministic fallback when AI isn't available |
| Tests | Vitest on real PostgreSQL 16 (API), Vitest with Testing Library (UI), a 90% coverage gate, and a Playwright E2E smoke (`npm run e2e`) that runs in CI on every PR |
| Delivery | GitHub Actions quality gates on every PR; every merge to `main` deploys through Cloudflare Workers Builds |

More detail: [docs/architecture.md](docs/architecture.md) and [docs/ai.md](docs/ai.md). Why each choice was made: the [decision register](docs/decisions.md) (one ADR per decision in [docs/adr/](docs/adr/)).

## How it was built: an AI team

This project was planned, designed, built, tested and documented by a team of **AI agents**: Claude Code sessions,
each given one role (product owner, architect, engineer, UX designer, QA, DevOps) and its own Jira, Confluence and
GitHub accounts, coordinated by an orchestrator agent. The accounts named Adam, Yousef, Malek, Haya, Salma, Basel and
Talia, and the GitHub Apps ending in `-malek[bot]`, `-basel[bot]`, `-haya[bot]` and `-yousef-docs[bot]`, are AI agents,
not people. The only human is the repository owner, Ahmed Oraby: he set the goals, made the decisions, reviewed the
work and approved and merged what shipped.

Each agent, its role and what it did, and the step-by-step path of a ticket from Jira to production (handoffs, reviews
and the automation behind each step), are on the Confluence page **«AI team & disclosure»** in the Smart Library space
(page id 20283394; the space link is in the submission).

## Tests

```bash
npm run check          # typecheck, dependency rules, lint, format check, build (must pass before a PR)
npm run test:coverage  # API + contracts tests, then the web tests, with the coverage gate
npm test               # API and contract tests on real PostgreSQL 16 (embedded, or TEST_DATABASE_URL)
npm test -w web        # UI component tests (Vitest, jsdom, Testing Library)
npm run typecheck      # tsc for contracts, api, web and e2e
npm run lint:deps      # architecture rules (dependency-cruiser): domain stays pure, no cross-module table access
npm run lint           # ESLint
npm run format         # Prettier (format:check in CI)
npm run e2e            # Playwright smoke in a real browser (also the e2e job in CI)
```

The API tests run against a real PostgreSQL 16, with no database mocks. The coverage gate is 90% for lines, statements and functions (branches: 85% for the API, 80% for the web app); the thresholds are in `vitest.config.ts` and `web/vitest.config.ts`.

### Quality gates (CI)

On `main` today every pull request runs the hygiene job, one `test` job (typecheck, dependency rules, API tests, build), the **e2e** job and the migrations gate. The shared Node CI and the AI guardrails arrive with PR #29. Once it merges, every pull request runs:

- **hygiene**: a secret scan (gitleaks) and a check that no employer or client name is in the repository.
- **ci / Build and test**: `npm ci`, `npm run check`, `npm run test:coverage` (the API tests move to the `pgvector/pgvector:pg16` image, so the HNSW path is tested too: [ADR-0163](docs/adr/0163-ci-postgres-image-pgvector-pgvector-pg16-so.md), accepted; until then CI's Postgres has no pgvector and the tests take the brute-force path), and an audit of production dependencies.
- **AI guardrails**: an AI-assisted PR ticks the AI-assistance box, changes tests when it changes source, and needs an owner review label when it changes workflows, the guardrail policy or migrations (`.ai-guard.toml`).
- **e2e** (`.github/workflows/e2e.yml`, on `main` now): `npm run e2e` on a GitHub-hosted runner; a failed test uploads its Playwright trace and screenshot as the `e2e-traces` artifact ([ADR-0184](docs/adr/0184-e2e-smoke-runs-github-ci-traces-kept.md)).
- **migrations gate**: a PR that adds or changes a migration fails until the migration has been applied to production and the PR has the label `migrations-applied`.
- **Jira status** ([ADR-0185](docs/adr/0185-qa-tests-pr-before-merge.md), QA before merge): QA tests the PR, not merged `main`. When a PR with `Closes SLM-<n>` opens, the issue moves from In Development to In Testing (`scripts/jira-ready-for-testing.mjs`); the PR merges only when every SLM key it names is in Ready for Release, which QA sets when the PR passed (`scripts/jira-status-check.mjs`, rules in `.github/jira-status.json`). The scripts and their tests are on `main`; the repository owner adds their workflow files.

Contribution rules (branch and PR naming, review replies) are in [AGENTS.md](AGENTS.md). Agents commit through their own GitHub Apps ([ADR-0068](docs/adr/0068-agents-reach-repo-through-their-github-apps.md)); a separate neutral App identity was considered and rejected ([ADR-0069](docs/adr/0069-neutral-github-app-identity-agent-commits.md)).

`npm run e2e` runs a small Playwright smoke in Chromium: a Librarian adds a book, borrows and returns it and finds it in Loan history; a Supervisor sees no write actions and a direct API write gets 403; an Admin resets the demo data. It starts its own throwaway PostgreSQL and Worker on free ports and removes them afterwards. CI runs it in the `e2e` job on every PR and every push to `main`, and keeps the trace of a failed test. Locally it needs the Playwright Chromium installed (`npx playwright install chromium`). The Supervisor test creates its user directly in that throwaway database and signs the session cookie with the run's own throwaway secret, because Supervisors normally come from Google sign-in; the app itself has no sign-in bypass.

Named release tests in `api/test`:

| Test name | What it proves |
|---|---|
| `rbac-matrix` | Every registered route has a row in the permission table, and each of the three roles gets exactly the allowed or forbidden answer |
| `no-auth-bypass` | Every protected route returns 401 without a session; only the health check and sign-in routes are public |
| `session-cookie-flags` | Missing, tampered, expired, foreign-secret or wrong-algorithm cookies are rejected; a cookie that claims a role does not change the role |
| `unknown-google-is-supervisor-readonly` | An unknown Google account becomes a read-only Supervisor |
| `demo-accounts-protected` | The demo accounts can't be changed from the Admin screen (409) |
| `concurrency-20-on-3` | 20 parallel borrows of a 3-copy book give exactly 3 successes and 17 conflicts |
| `inventory-invariant` | Available plus on-loan equals total after a mixed run of borrows, returns, edits and parallel bursts |
| `member-suspend-race` | A borrow racing a member deactivation ends in a consistent state in both orders |
| `reset-keeps-inventory-valid` | The demo reset restores a consistent seed and keeps staff accounts |

Other API tests cover parallel returns, the loan-limit race, two Admins demoting each other at once, search injection safety, the Google sign-in flow, rate limits and AI fallback paths. The schema-parity test checks that the Drizzle schema matches the SQL migrations.

## Configuration

Set as Worker vars or secrets, or in `.dev.vars` locally. See `.dev.vars.example` and `wrangler.toml`.

| Variable | Purpose | Default |
|---|---|---|
| `ENVIRONMENT` | `local`, `test` or `production` | `production` |
| `SESSION_SECRET` (secret) | signs the session cookie; 32+ characters | none (required) |
| `SESSION_HOURS` | session length, 1–24 hours | `8` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (secret) | Google OIDC sign-in. Set both or neither (one alone is a startup error). With neither, Google sign-in is off and its button is hidden. Redirect URI to register: `<origin>/api/auth/google/callback` | none |
| `DEMO_ACCOUNTS_ENABLED` | turns on the two demo accounts | `false` |
| `DEMO_LIBRARIAN_EMAIL`, `DEMO_LIBRARIAN_PASSWORD` (secret), `DEMO_ADMIN_EMAIL`, `DEMO_ADMIN_PASSWORD` (secret) | demo account credentials (never in the repo). Required when demo accounts are on. Emails must be on a reserved domain (`.test`, `.invalid` or `.example`) so a real inbox can never become a demo account; passwords must be 12+ characters | none |
| `BOOTSTRAP_ADMIN_EMAILS` | comma-separated Google emails that become Admin on first sign-in | none |
| `LOAN_DAYS`, `MAX_ACTIVE_LOANS` | loan period (1–60 days) and open-loan limit per member (1–50) | `14`, `5` |
| `AI_MODEL` | Workers AI model id. If empty (and no `AI_FAKE`), discovery uses deterministic ranking | none (`wrangler.toml` sets `@cf/meta/llama-3.2-3b-instruct`) |
| `AI_FAKE` | deterministic fake AI for local runs and tests (refused when `ENVIRONMENT=production`) | `false` |
| `EMBEDDING_MODEL` | Workers AI embedding model for hybrid retrieval (768 dimensions, matches migration 0004). `off` means full-text only | `@cf/baai/bge-base-en-v1.5` |
| `EMBEDDING_MIN_SIMILARITY` | minimum cosine similarity for a semantic match | `0.72` |
| `AI_DAILY_NEURON_CAP`, `AI_USER_DAILY_SEARCHES` | daily AI budget for the library, and AI-assisted searches per staff user (UTC day); past them, discovery steps down a tier (see [docs/ai.md](docs/ai.md)) | `8000`, `50` |
| `DATABASE_URL` | Postgres for scripts and local dev. In production, the `HYPERDRIVE` binding is used instead | none |

Unknown Google accounts start as **Supervisor** (read-only), and an Admin can promote them. A staff user is bound to their Google account id (`sub`) on first sign-in, and Google sign-in never opens a demo account.

## Repository layout

```
api/src/        Hono API. Each module (catalog, members, circulation, staff, discovery, dashboard, demo)
                has api/ · application/ · domain/ · infrastructure/ (demo has no domain/);
                platform/ holds cross-cutting code (config, errors, security)
api/test/       API tests on real PostgreSQL 16
contracts/src/  zod request and response schemas, shared with web/
migrations/     versioned SQL: 0001_init (schema, constraints), 0002_search (full-text and trigram indexes),
                0003_google_sub (Google account id on staff users), 0004_book_chunks (embedded description
                chunks; pgvector + HNSW where available), 0005_ai_cost (daily AI usage and a small cache)
seed/           demo data (public book metadata, fictional members)
web/            React SPA (features/, components/, routes/) with component tests
scripts/        migrate, seed, local Postgres, demo-local
docs/           architecture.md, ai.md, decisions.md (register), adr/ (one file per decision), img/ (diagrams)
e2e/            Playwright smoke (runs in CI on every PR, and locally)
scripts/test/   tests of the Jira scripts
.github/        CI workflows, the PR template and the Jira status rules; AGENTS.md has the contribution rules
```
