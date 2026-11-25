# 0017. Chunking: sentence windows of at most 120 words, with one sentence of overlap

- **Status:** Accepted
- **Date:** 2026-11-25
- **Deciders:** Ahmed Oraby (owner), architecture review

## Context

Vector search embeds book text. One vector per book blurs long descriptions; very small chunks lose context.

## Options considered

| Option | For | Against |
|---|---|---|
| One vector per book | simplest | long text gets blurred |
| Fixed token windows | uniform | cuts sentences in half |
| **Sentence windows ≤ 120 words, one sentence of overlap, each with a `Title — Author (Category)` header** | each chunk stands alone; scales to long text | a few more rows |

## Decision

- `domain/Chunking.ts` (pure, unit-tested) builds the chunks from the title, author, category and description.
- Seed descriptions are 180–220 words in our own words, so each book makes 2–3 chunks.
- Chunks are stored in `book_chunks` (unique `book_id, chunk_index, model`).
  - It is a derived, rebuildable index, with no foreign key to `books`.
  - Search joins live books, and the sync removes orphans.

## Consequences

- Text is re-embedded only when the text or the model changes (sha-256 source hash).
- A model change makes all chunks stale; the dimension is checked when the config loads.
