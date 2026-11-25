# 0019. AI cost tiers, a per-user quota and a daily Neuron cap; «AI-assisted search» wording

- **Status:** Accepted
- **Date:** 2026-11-25
- **Deciders:** Ahmed Oraby (owner), architecture review

## Context

- Workers AI is free up to 10,000 Neurons a day, then it fails.
- Spend must be bounded by design, limits must degrade gracefully, and users must see what's left.
- "Smart search" or "AI search" overstates what a 3B model does.

## Options considered

| Option | For | Against |
|---|---|---|
| No limits | simplest | one user can use up the day for everyone |
| AI Gateway / Workers Cache API | managed | the Cache API is a no-op on `*.workers.dev`; the gateway duplicates our caps |
| **Three tiers with a per-user quota and a global cap, counted in Postgres** | every limit ends in a cheaper tier, never an error | counters to keep correct |

## Decision

**Tiers:**

| Tier | When | Retrieval | Ranking | Cost |
|---|---|---|---|---|
| 1 | normal | hybrid | model, with reasons | ≈ 16 Neurons (≤ 26) |
| 2 | the user's **50 AI-assisted searches** for the UTC day are used (`QUOTA_EXCEEDED`) | hybrid | RRF order, no model | ≈ 0.1 Neuron |
| 3 | the library's **8,000 Neurons** for the UTC day are used (80 % of the free allocation, `BUDGET_EXHAUSTED`) | full-text only, no embeddings | deterministic | 0 |

**How it's counted and saved:**
- Counts use atomic conditional upserts in `ai_usage`.
- Caches live in `ai_cache`: query embeddings for 24 h, and AI rankings for 15 minutes, never when a `memberId` is set.
- The model is skipped at 0 or 1 candidate.
- Search runs on submit only. Discovery is limited to 10 requests a minute per user, and reindex to 2 a minute.

**Wording:** the UI says **«AI-assisted search»** and shows "N of 50 AI-assisted searches left today". Admins see today's Neurons on the dashboard.

## Consequences

- Normal use can't exceed the free allocation. A burst can overshoot by a few calls, and the 20 % headroom absorbs it.
- The rates come from the Cloudflare pricing page, read on 2026-11-25. A price change means updating the rates in config.
