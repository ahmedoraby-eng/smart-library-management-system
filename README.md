# Smart Library Management System

A staff-facing library operations app: catalogue, members, **Borrow Book** / **Return Book**, loan history, search, and AI-assisted book discovery. Admins, Librarians and Supervisors sign in. Members are records and never sign in.

> **Our interpretation.** The assessment doesn't say whether the app is staff-facing or customer-facing. We chose staff-facing because every required feature is an operator action.
>
> **Terminology.** The assessment says *check-in* means "marked as borrowed" and *check-out* means "marked as returned". To avoid confusion, the app only uses **Borrow Book** (`POST /api/loans/borrow`) and **Return Book** (`POST /api/loans/{id}/return`).

> 🚧 Work in progress: this is the walking skeleton (story SL-06). Features land story by story.

## Stack
| Layer | Choice |
|---|---|
| API | TypeScript, [Hono](https://hono.dev) on Cloudflare Workers, modular monolith (`api → application → domain ← infrastructure`) |
| Database | PostgreSQL 16 (Neon in production, reached through Cloudflare Hyperdrive), Drizzle, versioned SQL migrations |
| UI | React, TypeScript, Vite, Tailwind, TanStack Router (typed routes; filters in the URL) and TanStack Query, served by the same Worker (one URL, no CORS) |
| Contracts | zod schemas in `contracts/`, shared by the API and the UI |
| Auth | Sign in with Google (OIDC) in the app, plus two demo staff accounts; HttpOnly session cookie; roles live in our DB and are read on every request |
| AI | Workers AI ranks real catalogue candidates; the app falls back to deterministic results if the AI isn't available |
| Tests | Vitest on real PostgreSQL 16, a local Playwright smoke for the main user journeys (`npm run e2e`) |

## Run locally
**Quickest:** `npm install` then `npm run demo:local`. It starts an embedded PostgreSQL 16 on a free port, migrates, loads the demo data, creates `.dev.vars` with random local demo passwords, runs the app, and prints the URL and the demo sign-ins. Ctrl+C stops it.

Step by step:
Prerequisites: Node 20 or newer, and either Docker **or** nothing else (an embedded PostgreSQL 16 is included).

```bash
docker compose up -d db          # or, without Docker: npm run db:local  (keep it running)
npm install
cp .env.example .env && cp .dev.vars.example .dev.vars   # then fill SESSION_SECRET and the demo passwords
export DATABASE_URL=postgres://library:library@localhost:5432/library
npm run db:migrate && npm run seed
npm run dev                      # http://localhost:8787
```
Sign in at http://localhost:8787 with a demo account: the emails and passwords are the `DEMO_*` values you put in `.dev.vars`. There is no auth bypass in any environment. Google sign-in works once `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set.

| Who | Role |
|---|---|
| Demo Librarian (`DEMO_LIBRARIAN_*`) | Librarian: daily operations |
| Demo Admin (`DEMO_ADMIN_*`) | Admin: also staff management and «Reset demo data» |
| Any other Google account | Supervisor (read-only) on first sign-in |

The demo data (books, members, loans) is restored every night by a Cron Trigger, and an Admin can reset it at any time. Staff accounts are kept.

## Test
```bash
npm test             # unit and integration tests on real PostgreSQL 16 (embedded, or TEST_DATABASE_URL)
npm run typecheck
npm run lint:deps    # architecture rules: domain stays pure, no cross-module table access
npm run e2e          # local Playwright smoke (see below)
```

`npm run e2e` runs a local Playwright smoke (3 flows: librarian borrow/return, supervisor read-only, admin reset) against a throwaway database and Worker on free ports; not part of CI. It needs the Playwright Chromium already installed on the machine.

## Configuration
| Variable | Purpose | Default |
|---|---|---|
| `ENVIRONMENT` | `local`, `test` or `production` | `production` |
| `SESSION_SECRET` (secret) | signs the session cookie; 32+ characters | none (required) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (secret) | Google OIDC sign-in | none (Google sign-in off) |
| `DEMO_ACCOUNTS_ENABLED` | turns on the two demo accounts | `false` |
| `DEMO_LIBRARIAN_EMAIL`, `DEMO_LIBRARIAN_PASSWORD` (secret), `DEMO_ADMIN_EMAIL`, `DEMO_ADMIN_PASSWORD` (secret) | demo account credentials (never in the repo) | none |
| `BOOTSTRAP_ADMIN_EMAILS` | comma-separated Google emails that become Admin on first sign-in | none |
| `LOAN_DAYS`, `MAX_ACTIVE_LOANS` | loan period (1–60 days) and open-loan limit per member | `14`, `5` |
| `AI_MODEL` | Workers AI model id. If empty, discovery uses deterministic ranking | none |
| `DATABASE_URL` | Postgres for scripts and local dev. In production, the `HYPERDRIVE` binding is used instead | none |

| `AI_FAKE` | deterministic fake AI for local runs and tests (refused in production) | `false` |

Unknown Google accounts start as **Supervisor** (read-only), and an Admin can promote them.

## Repository layout
```
api/src/        Hono API. Each module (catalog, members, circulation, staff, discovery, dashboard)
                has api/ · application/ · domain/ · infrastructure/; platform/ holds cross-cutting code
contracts/src/  zod request and response schemas, shared with web/
migrations/     versioned SQL (0001_init, 0002_search)
seed/           demo data (public book metadata, fictional members)
web/            React SPA
scripts/        migrate, seed, local Postgres
```
