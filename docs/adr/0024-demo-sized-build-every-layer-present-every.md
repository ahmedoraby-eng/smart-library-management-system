# 0024. Demo-sized build: every layer present, every decision defensible

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** scope
- **Deciders:** Ahmed Oraby (owner)

## Context

The app serves a 3-day technical assessment for an AI Engineering Manager role. Volume of features matters less than judgement and quality.

> Ahmed Oraby: «مش عايزين نكون اوفر انجينير الحاجه، عايزين نخلي الحاجه نوعا ما في الحجم بتاع ... اقرب للديمو او اسسمنت»

## Options considered

| Option | For | Against |
|---|---|---|
| **Demo-sized app with all layers and a defensible reason for each choice** | fits 3 days; easy to walk through in the interview | fewer features |
| Full delivery ceremony and tooling | looks thorough | over-engineered for the time box |

## Decision

- Keep the product close to demo or assessment size: no over-engineering.
- Every layer exists (UI, API, application, domain, data, CI/CD, AI).
- About 10–15 big tickets, not hundreds.

## Consequences

- Scope cuts are easy to justify.
- Some production concerns are documented as limits instead of built.

## Sources

Public: README.md

Also from the owner's working notes and conversations (not published): engagement notes; master prompt; owner conversation, 2026-11-24
