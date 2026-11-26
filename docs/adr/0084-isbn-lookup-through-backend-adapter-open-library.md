# 0084. ISBN lookup through a backend adapter to Open Library, waits up to 6 seconds

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** architecture
- **Deciders:** Product owner, architecture review

## Context

ISBN autofill is an extra; it must never block saving a book.

## Options considered

| Option | For | Against |
|---|---|---|
| **Backend adapter with timeout and graceful fallback** | resilient; same pattern as the AI provider | one more endpoint |
| Call from the browser | no backend code | CORS, no control, harder to test |
| Google Books | rich data | needs a key |

## Decision

- `GET /api/books/isbn-lookup?isbn=` (BOOK_WRITE) always returns 200 with found true/false (not_found / timeout / unavailable); an invalid ISBN is 400 with no outbound call.
- Port `IsbnLookup` + `OpenLibraryIsbnLookup` (fetch, 6 s abort (`ISBN_LOOKUP_TIMEOUT_MS` in `contracts/src/books.ts`; the browser waits 2 s longer, 8 s), generic User-Agent). No key or binding.
- Open Library answered in 3.3 to 6.5 s when busy and 0.9 to 2.2 s at normal load (26/11/2026), so the wait is 6 s: it covers most slow-wave answers, and the slowest fall back to manual entry. There is no retry. Successful lookups are kept in memory per Worker isolate (200 entries, 1 h), so a repeated ISBN answers at once; failures are never cached. Waiting on `fetch` is I/O, not CPU time, so it does not count against the Workers CPU limit.
- UI 'Look up' fills only empty fields and says 'Filled from Open Library – check before saving'. Category and description aren't prefilled.
- Tests stub the adapter.

## Consequences

- Not-found and timeout show the same message (a known polish item).

## Sources

Public: PR #13; commit 94420a2; docs/architecture.md diagram

Also from the owner's working notes and conversations (not published): design notes; Jira SLM-13; decisions/extras.md:18; decisions/ux.md:186
