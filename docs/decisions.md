# Decision register

The architecture decisions for Smart Library, one file each in [`adr/`](adr/). Superseded decisions are kept for their history; the decision that replaced them is linked.

| ID | Title | Date | Status | Link |
|---|---|---|---|---|
| ADR-0001 | Record architecture decisions as ADRs | 2026-11-25 | Accepted | [adr/0001-record-architecture-decisions.md](adr/0001-record-architecture-decisions.md) |
| ADR-0002 | Stack: TypeScript, Hono on Cloudflare Workers, PostgreSQL 16, React + TanStack Router | 2026-11-24 | Accepted | [adr/0002-stack-typescript-hono-workers-postgres.md](adr/0002-stack-typescript-hono-workers-postgres.md) |
| ADR-0003 | Cloudflare D1 (SQLite) as the database | 2026-11-24 | Superseded by [0002](adr/0002-stack-typescript-hono-workers-postgres.md) | [adr/0003-cloudflare-d1-database.md](adr/0003-cloudflare-d1-database.md) |
| ADR-0004 | Modular monolith with layers enforced in CI | 2026-11-24 | Accepted | [adr/0004-modular-monolith-enforced-layers.md](adr/0004-modular-monolith-enforced-layers.md) |
| ADR-0005 | One Worker serves the SPA and the API on one URL | 2026-11-24 | Accepted | [adr/0005-one-worker-one-url.md](adr/0005-one-worker-one-url.md) |
| ADR-0006 | Copies as counts; borrow and return as one transaction with guarded updates | 2026-11-24 | Accepted | [adr/0006-copies-as-counts-guarded-updates.md](adr/0006-copies-as-counts-guarded-updates.md) |
| ADR-0007 | Loan status derived at read time (OVERDUE is never stored) | 2026-11-24 | Accepted | [adr/0007-derived-overdue-status.md](adr/0007-derived-overdue-status.md) |
| ADR-0008 | Hand-written SQL migrations, no drizzle-kit | 2026-11-24 | Accepted | [adr/0008-hand-written-sql-migrations.md](adr/0008-hand-written-sql-migrations.md) |
| ADR-0009 | Sign-in: Google OIDC in the app plus demo accounts, with no password hashing | 2026-11-24 | Accepted | [adr/0009-google-oidc-and-demo-accounts.md](adr/0009-google-oidc-and-demo-accounts.md) |
| ADR-0010 | PBKDF2 hashes for demo account passwords in the database | 2026-11-24 | Superseded by [0009](adr/0009-google-oidc-and-demo-accounts.md) | [adr/0010-pbkdf2-demo-password-hashes.md](adr/0010-pbkdf2-demo-password-hashes.md) |
| ADR-0011 | Roles read from the database on every request | 2026-11-24 | Accepted | [adr/0011-roles-read-per-request.md](adr/0011-roles-read-per-request.md) |
| ADR-0012 | Nightly demo data reset | 2026-11-24 | Accepted | [adr/0012-nightly-demo-reset.md](adr/0012-nightly-demo-reset.md) |
| ADR-0013 | AI discovery: the model only ranks real candidates, a validator guards it, and a deterministic fallback always answers | 2026-11-24 | Accepted | [adr/0013-llm-ranks-only-validator-fallback.md](adr/0013-llm-ranks-only-validator-fallback.md) |
| ADR-0014 | Workers AI as the model provider, behind an `AiProvider` interface | 2026-11-24 | Accepted | [adr/0014-workers-ai-provider.md](adr/0014-workers-ai-provider.md) |
| ADR-0015 | Full-text-only candidate retrieval for AI discovery | 2026-11-24 | Superseded by [0016](adr/0016-hybrid-retrieval-rrf.md) | [adr/0015-full-text-only-retrieval.md](adr/0015-full-text-only-retrieval.md) |
| ADR-0016 | Hybrid retrieval: full-text + vector, fused with RRF (k = 60), similarity threshold 0.72 | 2026-11-25 | Accepted | [adr/0016-hybrid-retrieval-rrf.md](adr/0016-hybrid-retrieval-rrf.md) |
| ADR-0017 | Chunking: sentence windows of at most 120 words, with one sentence of overlap | 2026-11-25 | Accepted | [adr/0017-chunking-120-words.md](adr/0017-chunking-120-words.md) |
| ADR-0018 | pgvector HNSW in production, with a `real[]` brute-force fallback | 2026-11-25 | Accepted | [adr/0018-pgvector-hnsw-with-fallback.md](adr/0018-pgvector-hnsw-with-fallback.md) |
| ADR-0019 | AI cost tiers, a per-user quota and a daily Neuron cap; «AI-assisted search» wording | 2026-11-25 | Accepted | [adr/0019-ai-cost-tiers-and-quotas.md](adr/0019-ai-cost-tiers-and-quotas.md) |
| ADR-0020 | «Reading Room» visual identity, with a «Plain» theme toggle | 2026-11-25 | Accepted | [adr/0020-reading-room-identity.md](adr/0020-reading-room-identity.md) |
| ADR-0021 | Deploy from GitHub Actions with wrangler, with migrations in the deploy job | 2026-11-24 | Superseded by [0022](adr/0022-workers-builds-auto-deploy.md) | [adr/0021-github-actions-wrangler-deploy.md](adr/0021-github-actions-wrangler-deploy.md) |
| ADR-0022 | Auto-deploy through Workers Builds; migrations by hand behind a migrations gate | 2026-11-25 | Accepted | [adr/0022-workers-builds-auto-deploy.md](adr/0022-workers-builds-auto-deploy.md) |
| ADR-0023 | Close the issue on merge, moving it to Released only after the deploy check | 2026-11-25 | Accepted | [adr/0023-close-on-merge-after-deploy.md](adr/0023-close-on-merge-after-deploy.md) |

## Adding a decision

1. Copy [`adr/template.md`](adr/template.md) to `adr/NNNN-short-title.md`, using the next free number, and fill it in (keep it short).
2. Add its row here, in the same PR that makes the decision.
3. To replace a decision, write a new ADR and set the old one's status to `Superseded by NNNN`. Don't rewrite the old one.
