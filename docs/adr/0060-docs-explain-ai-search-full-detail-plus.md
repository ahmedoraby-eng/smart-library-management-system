# 0060. Docs explain AI search in full detail, plus a cost page

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** process
- **Deciders:** Ahmed Oraby (owner)

## Context

AI use and its cost are part of how the assessment is judged.

> Ahmed Oraby: «محتاج انه كمان بيج تانية تبقى ليها علاقه بالكوست، وازاي احنا حاسبين الكوست تقريبي»

## Options considered

| Option | For | Against |
|---|---|---|
| **Show the real prompts, payloads, SQL and cost maths** | transparent and defensible | longer pages |

## Decision

- Page 2/2.1 documents query normalisation, the tsvector and its weights, ranking SQL, top-up, the exact model payload, system prompt, JSON schema, the prompt-injection threat model, fallback reasons and limits.
- A cost page shows how cost is estimated and bounded.

## Consequences

- Any change to prompts or limits must update these pages.

## Sources

Public: docs/decisions.md

Also from the owner's working notes and conversations (not published): owner conversation, 2026-11-24
