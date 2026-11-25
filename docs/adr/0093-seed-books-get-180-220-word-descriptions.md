# 0093. Seed books get 180–220-word descriptions in our own words

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** data
- **Deciders:** Ahmed Oraby (owner)

## Context

Semantic search needs real text to embed; publisher blurbs can't be copied.

> Ahmed Oraby: «يكون ريليفنت للكتاب، المعنى الحقيقي بتاع الكتاب... حتى لو مش منقول من الناشر»

## Options considered

| Option | For | Against |
|---|---|---|
| **Original, faithful descriptions, 2–3 chunks per book** | good semantic demo; no copyright issue | writing time |

## Decision

- All 64 seed books get 180–220-word descriptions faithful to the real book, not publisher blurbs, no quotations; doubtful details left out.
- Three memoirs avoid the words 'los*' and 'pare*' so the semantic demo case stays semantic.
- A test covers all 64; product owner spot-checked.

## Consequences

- Each book makes 2–3 chunks (ADR 0017).

## Sources

Public: PR #20; commit c8099f7

Also from the owner's working notes and conversations (not published): owner conversation, 2026-11-24; owner conversation, 2026-11-25; Jira SLM-16
