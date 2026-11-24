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
- [x] **AI feature: Smart Book Discovery.** Describe what a member needs in words and get up to 5 real catalogue books with a reason and live availability. Falls back to keyword ranking when AI is not available. See [docs/ai.md](docs/ai.md).
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
| AI | Workers AI ranks real catalogue candidates; the app falls back to deterministic results if the AI isn't available |
| Tests | Vitest on real PostgreSQL 16 (API), Vitest with Testing Library (UI), and a local Playwright smoke (`npm run e2e`) |

More detail: [docs/architecture.md](docs/architecture.md) and [docs/ai.md](docs/ai.md).

## Tests

```bash
npm test             # API and contract tests on real PostgreSQL 16 (embedded, or TEST_DATABASE_URL)
npm test -w web      # UI component tests (Vitest, jsdom, Testing Library)
npm run typecheck    # tsc for contracts, api and web
npm run lint:deps    # architecture rules (dependency-cruiser): domain stays pure, no cross-module table access
npm run e2e          # local Playwright smoke in a real browser (not part of CI)
```

The API tests run against a real PostgreSQL 16, with no database mocks.

`npm run e2e` runs a small Playwright smoke in Chromium: a Librarian adds a book, borrows and returns it and finds it in Loan history; a Supervisor sees no write actions and a direct API write gets 403; an Admin resets the demo data. It starts its own throwaway PostgreSQL and Worker on free ports and removes them afterwards. It is local only (not part of CI) and needs the Playwright Chromium installed (`npx playwright install chromium`). The Supervisor test creates its user directly in that throwaway database and signs the session cookie with the run's own throwaway secret, because Supervisors normally come from Google sign-in; the app itself has no sign-in bypass.

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
                0003_google_sub (Google account id on staff users)
seed/           demo data (public book metadata, fictional members)
web/            React SPA (features/, components/, routes/) with component tests
scripts/        migrate, seed, local Postgres, demo-local
docs/           architecture.md, ai.md
```
