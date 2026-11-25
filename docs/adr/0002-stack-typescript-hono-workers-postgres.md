# 0002. Stack: TypeScript, Hono on Cloudflare Workers, PostgreSQL 16, React + TanStack Router

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** stack
- **Deciders:** Ahmed Oraby (owner), architecture review

## Context

Constraints: 3 days to build, $0 to run, a live demo with no cold-start pain, a real relational database with transactions, clear separation of concerns, and no all-in-one backend-as-a-service. Closeness to Java was a preference, not a requirement. Earlier drafts used Kotlin on Cloud Run (v1) and Cloudflare D1 (v2, see [0003](0003-cloudflare-d1-database.md)).

Scored 1–5 on each criterion (total of 35):

| Criterion | **A. Hono + Drizzle on Workers + Postgres** | B. Kotlin/Ktor + Postgres | C. Hono on Workers + D1 | D. NestJS + Prisma + Postgres on a free Node host |
|---|:-:|:-:|:-:|:-:|
| Support and community maturity | 4 | 4 | 3 | 5 |
| How common it is | 4 | 3 | 3 | 5 |
| Lightweight | 5 | 3 | 5 | 2 |
| Fit for this app (CRUD + transactions + one AI call) | 5 | 4 | 3 | 4 |
| Speed of development and change | 5 | 3 | 5 | 4 |
| Easy to defend | 5 | 4 | 3 | 4 |
| Free hosting without demo pain | 5 | 2 | 5 | 2 |
| **Total** | **33** | **23** | **27** | **26** |

The front end was scored the same way. E, TanStack Start full-stack, scored 25: a six-week-old 1.0, SSR that an internal app doesn't need, and typed RPC instead of a visible REST contract. **F, option A + TanStack Router in the SPA, scored 33.**

## Options considered

| Option | For | Against |
|---|---|---|
| **A + F** | one language, $0, millisecond cold start, real Postgres transactions, explicit REST API | Hono is younger than Express; Neon free sleeps when idle (resumes in under a second) |
| B. Kotlin/Ktor | closest to Java | free JVM hosts sleep or need billing; setup time inside 3 days |
| C. D1 | simplest on Workers | no interactive transactions; stock safety would live in triggers |
| D. NestJS + Prisma | most common, Spring-like | heavy for four entities; free Node hosts sleep 30–60 s |
| E. TanStack Start | typed RPC, official Workers adapter | young, SSR not needed, blurred API boundary |

## Decision

- TypeScript (strict) end to end.
- API: **Hono** on **Cloudflare Workers**.
- Database: **PostgreSQL 16**.
  - In production: Neon's free tier, used as plain Postgres only, reached through **Hyperdrive** with the query cache off.
  - Locally and in CI: Docker or an embedded Postgres.
- **Drizzle** for typed queries (migrations: [0008](0008-hand-written-sql-migrations.md)).
- UI: React + Vite + Tailwind, **TanStack Router** (typed routes, zod-validated URL search params) and TanStack Query.
- **zod** contracts shared by the API and the UI.
- Vitest and Playwright for tests.

## Consequences

- We gave up the JVM and Spring ecosystem, and an SSR framework.
- Any Postgres works: only the connection string changes.
- Revisit if the app gets public, SEO-relevant pages: TanStack Start fits then.

## Notes

Criteria named by the owner: support, how common, lightweight, fit, speed of development and change, easy to defend, plus free hosting. Hono was chosen over Express and NestJS because it is light and the design lives in our layers; Drizzle (node-postgres driver) over Prisma so the stock SQL stays visible. Filters, sort and page live in the URL as zod-validated search params. Hyperdrive's query cache is off so availability is never served stale; Supabase was rejected because it pauses after a week idle.

> Ahmed Oraby: «تكون ليها سبورت كفايه، تكون كومن، تكون لايت ويت، مناسبه للابلكيشن، سريعه في الديفلوبمنت والتشينجز»

## Sources

decisions/architecture.md:3,48-64,75; decisions/architecture.md:10,15,22-47,122; backlog/slm-tickets-draft.md:5; handover notes; PR #27; README 'Stack' on origin/main; Confluence page 19267692; Confluence page 19365918; owner conversation, 2026-11-24; Jira SLM-2
