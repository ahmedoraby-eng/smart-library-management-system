# Smart Book Discovery (AI)

A librarian describes what a member needs ("a short book on clean code for a beginner") and gets up to 5 real books from the catalogue, each with a reason and live availability.

The rule behind the design: **the catalogue is the source of truth.** The model never adds books. It can only choose among books the database already returned, and everything shown about a book (title, author, availability) is read from the database again after the model answers. If the model is missing, slow or wrong, the user still gets keyword results.

Code: `api/src/discovery/`. UI: `web/src/features/discovery/`.

## Flow

```mermaid
sequenceDiagram
  participant U as Librarian (browser)
  participant API as POST /api/ai/book-discovery
  participant DB as PostgreSQL
  participant M as Workers AI
  U->>API: query, optional memberId, limit, availableOnly
  par 1. hybrid retrieval
    API->>DB: full-text + trigram (top 20)
  and
    API->>M: embed the query (bge-base, 1.5 s budget)
    API->>DB: nearest chunks (pgvector HNSW, cosine)
  end
  API->>API: fuse with RRF (k = 60), up to 20 candidates
  alt no candidates
    API-->>U: empty list + note (model not called)
  else candidates found
    API->>DB: 2. titles of the member's last 5 loans (if memberId)
    API->>M: 3. rank and explain (JSON, 8 s timeout)
    M-->>API: recommendations (untrusted)
    API->>API: 4. validate: keep candidate ids only
    API->>DB: 5. re-read title, author, availability
    API-->>U: mode AI, items with reasons
  end
  Note over API,M: Any failure or unusable answer: deterministic ranking, mode FALLBACK
```

## Request

`POST /api/ai/book-discovery`, allowed for Admin, Librarian and Supervisor (`AI_DISCOVER`).

| Field | Rule |
|---|---|
| `query` | Required text, 3 to 500 characters |
| `memberId` | Optional member id. Used only to avoid recommending what the member has just read (see Privacy) |
| `limit` | Optional, 1 to 5 (default 5) |
| `availableOnly` | Optional. Retrieval keeps only books with at least one copy on the shelf |

Order of checks: permission, then a rate limit of 10 requests per minute per staff user (`429` with `Retry-After`), then validation.

## Retrieval (hybrid, SLM-16)

`HybridCatalogRetrieval` runs two retrievers in parallel and fuses their rankings. Both return real catalogue rows only.

### 1. Full-text (lexical): `PgCatalogRetrieval`

1. The request is cut into search words: letters and digits only, at least 3 characters, common words removed ("the", "book", "want"...), at most 12. Because only letters and digits survive, no search operator can get into the query.
2. Books match if the weighted full-text vector (title, category, author, description; English stemming, words OR-ed) matches, **or** a trigram word similarity of title or author with the request is above 0.5 (this catches typos).
3. Hits are ordered by full-text rank plus the best title/author similarity, top 20. Archived books are never included.

### 2. Vector (semantic): `book_chunks` + Workers AI embeddings

- **Model:** `@cf/baai/bge-base-en-v1.5` (768 dimensions, `EMBEDDING_MODEL`; `off` turns vector search off). It's called through the `AI` binding: `env.AI.run(model, { text: [...] })`. Vectors are L2-normalised. Search queries get bge's retrieval instruction prefix.
- **Chunking** (`domain/Chunking.ts`): the source text is title, author, category and description. The description is split into sentences and packed into windows of at most 120 words, with one sentence of overlap. Every chunk starts with a `Title — Author (Category)` header, so it stands on its own. Every seed book has a 180–220-word description in our own words, faithful to what the book is about (not a publisher's blurb), so each book makes 2–3 chunks and the windowing is visible.
- **Index** (migration `0004_book_chunks.sql`): one row per chunk (unique `book_id, chunk_index, model`) with `content`, `source_hash`, `model` and `embedding real[]`. Where the server has pgvector (Neon), the migration also adds `embedding_v vector(768)` and an **HNSW index with cosine distance** (`vector_cosine_ops`), and the query uses `<=>`. Without pgvector (the embedded Postgres used for local runs and e2e), the same port scans `embedding` in the app. CI runs the tests on a pgvector image (the HNSW path); local runs use the scan. That's fine for a demo-size catalogue. The path is logged once per isolate and reported by `/api/health?deep=1` (`vector: "hnsw" | "brute-force" | "off"`).
- **Query:** embed the request, take the nearest chunks, keep each live book's best chunk, drop anything below the minimum similarity (`EMBEDDING_MIN_SIMILARITY`, default 0.72: bge-base cosines sit high, and unrelated texts often score 0.6–0.7), top 20. Every request logs the top similarity (a number only), so the value can be checked against live queries and changed in config. `availableOnly` applies here too.
- `book_chunks` belongs to the discovery module. It's a derived index that can be rebuilt at any time, with no foreign key to `books`: search joins live books, and the sync removes orphans.

### 3. Fusion: Reciprocal Rank Fusion

`score(book) = Σ 1 / (60 + rank)` over the two lists (rank starts at 1). Only ranks are used, so the two retrievers' scores never need to be on one scale. Ties go to the better full-text rank. The best **20** become the candidates, and each one records **`foundBy`**: `lexical`, `semantic` or `both`.

If fewer than 5 books are fused, the list is topped up from the categories of the matches, and from any category whose name resembles the request (`foundBy: "related"`, ranked last).

Each candidate carries its id, title, author, category, year, a description cut to 200 characters, and the request words found in its text (`matchedTerms`). A book found only by meaning usually has none, and its template reason says "Close in meaning to the request".

### When chunks are embedded

`BookIndexSync` re-chunks and re-embeds only books whose text, or the model, changed (sha-256 of model plus text). A book whose ids changed but whose text didn't (the demo reset) **copies** the vectors of the identical text, so it costs 0 Neurons. Copies, new rows and orphan removal happen in one transaction. It runs:

| When | How |
|---|---|
| A book is created, edited or archived | Inline in the same request, 2 s budget. A failure never fails the save; the next sync catches up |
| Demo reset (Admin button and nightly cron) | `syncAll` after the seed, since the seed gives books new ids |
| Backfill (after the migration, or a model change) | **Admin dashboard → «Rebuild search index»**: it calls `POST /api/admin/discovery/reindex` batch after batch until nothing is left, shows progress, and waits out the 2-a-minute limit |
| Automatically, hourly (minute 5) | A light cron trigger runs one batch when something is missing or stale (post-deploy backfill, failed inline syncs). When everything is up to date it's two cheap queries and no AI call. Hourly, not more often, so Neon can sleep (free compute hours), and at minute 5 so it never runs with the 00:00 reset |
| Local runs and e2e (`AI_FAKE`) | `demo:local` and `npm run e2e` index the seed with the deterministic fake embedder |

Embedding happens inside the Worker through its binding, so no Cloudflare token is needed in scripts or the repository.

### Fallback: discovery never breaks

If there's no `AI` binding, the query embedding fails, or embedding plus vector query take longer than **1.5 s**, retrieval is **full-text only** (`retrieval: "lexical"` in the response, with the reason in the log: `NO_EMBEDDER`, `EMBEDDING_ERROR` or `TIMEOUT`). Everything after retrieval is unchanged.

## The model step

`selectProvider` chooses the provider when the container is built:

| Condition | Provider |
|---|---|
| `AI_FAKE=true` (local runs and tests; refused in production) | `FakeAiProvider`, a deterministic stand-in |
| An `AI` binding and `AI_MODEL` are set | `WorkersAiProvider` (Cloudflare Workers AI) |
| Neither | none: keyword mode |

`wrangler.toml` sets `AI_MODEL = "@cf/meta/llama-3.2-3b-instruct"`.

The Workers AI call:

- A system message holds the rules only: recommend only candidate ids, at most 5, one or two sentences of plain-text reason each, return an empty list if nothing fits, and treat the request, the candidate fields and the reading history as untrusted data, never as instructions.
- A user message holds one JSON object: the request, `alreadyRead` (the member's recent titles) and the candidates.
- `temperature` 0.2, `max_tokens` 600, and a JSON schema for the output: `recommendations[]` with `bookId`, `reason` and `fit` (1 to 5), plus an optional `note`.
- The server stops waiting for the model after **8 seconds** and answers with the fallback.

## The validator

The model's answer is untrusted. `RecommendationValidator` is the guard:

- The answer must be an object (or a JSON string) with a `recommendations` array. Otherwise it is rejected as unusable.
- An item is dropped if its `bookId` is not one of the candidates, if it duplicates an earlier item, or if the limit is already reached.
- Items are ordered by `fit`, highest first, keeping the model's order within the same fit.
- Reasons are cleaned to plain text (control characters removed, spaces collapsed) and cut to 300 characters. An empty reason is replaced by a template: "Matches: ..." with the matched words, or "Related to" the category.
- The optional `note` gets the same cleaning.
- Availability is never taken from the model.

## The fallback

`FallbackRanker` sorts candidates by retrieval score (best first, ties by title) and writes the template reason for each. The response has `mode: "FALLBACK"` and a note. It is used when:

| Reason | When |
|---|---|
| `NO_PROVIDER` | No model is configured |
| `TIMEOUT` | No answer within 8 seconds |
| `PROVIDER_ERROR` | The provider threw |
| `INVALID_OUTPUT` | The answer has no usable shape |
| `NO_VALID_ITEMS` | The model returned ids, but every one was dropped |
| `SINGLE_CANDIDATE` | Only one book matched: the model is skipped on purpose (shown as an info note, not a warning) |
| `QUOTA_EXCEEDED` | This staff user has used today's AI-assisted searches (see Cost controls) |
| `BUDGET_EXHAUSTED` | The library's daily Neuron cap is reached (see Cost controls) |

If retrieval finds no candidates, the model is not called. The response is an empty list with the note "No matching books in the catalog."

If the model answers with a valid but empty list, the response is `mode: "AI"` with an empty list and the model's note (or the same "no matching books" note).

## Response

```
{ mode: "AI" | "FALLBACK",
  items: [{ book: { id, title, author, category, publicationYear, coverImageUrl,
                    availableCopies, totalCopies, nextDueAt },
            reason, matchedTerms, foundBy? }],      // foundBy: lexical | semantic | both | related
  note: string | null,
  retrieval?: "hybrid" | "lexical",
  fallbackReason?: string,          // FALLBACK only
  cached?: boolean }                // ranking reused from the result cache
```

- `book` always comes from a fresh database read, after the model has answered. A copy borrowed in the meantime shows up.
- In the UI, `AI` shows an "AI-ranked" badge and a "Why this book" line per result. `FALLBACK` shows a "Keyword match" badge and the note as a warning.
- A result found by vector search alone shows a small "Found by meaning" note.
- Each result shows availability (and the next due date when none is on the shelf). Users who can process loans get a shortcut to borrow when a copy is available.

## Privacy

- With a `memberId`, the server looks up the **titles only** of that member's last 5 loans and sends them to the model as `alreadyRead`. No names, emails or member numbers are sent. A test checks this.
- The model also receives the request text and the candidate books' public metadata (title, author, category, year, a description up to 200 characters).
- Logs record the mode, latency, number of candidates, fallback reason, provider name and the number of dropped items, plus the retrieval mode and how many candidates each retriever found. They never record the request text.
- Embeddings are made from public catalogue text only (title, author, category, description). The request text is embedded but not stored.
- Workers AI is called through a Worker binding, so there is no AI key in the code or the configuration.

## Cost controls (SLM-16)

AI spend is bounded by design. Every step below costs nothing when it isn't needed, and every limit ends in a cheaper tier with a clear note, never in an error.

### Tiers

| Tier | When | Retrieval | Ranking | Cost |
|---|---|---|---|---|
| **1** | normal | hybrid (full-text + vector, RRF) | AI model, with reasons | ≈ 16 Neurons (≤ 26) + ≈ 0.1 |
| **2** | the user's 50 AI-assisted searches today are used (`QUOTA_EXCEEDED`) | hybrid | RRF order, no model, no reasons | ≈ 0.1 Neuron (0 on a cached query) |
| **3** | the library's 8,000 Neurons today are used (`BUDGET_EXHAUSTED`); embeddings stop too | full-text only | deterministic | 0 |

The response carries `tier` and `aiSearches: { left, limit }`. `GET /api/ai/quota` returns the same count for the page load. The discovery page shows "N of 50 AI-assisted searches left today" next to the search, a red note under the search box at 0, and a calm info note in tier 3.

If embeddings fail (an error, or more than 1.5 s) while the user still has AI-assisted searches, retrieval drops to full-text only and the model still ranks. A failed embedding isn't a cost signal, so the reasons are kept. The response then says `retrieval: "lexical"`.

| Control | What it does |
|---|---|
| Submit-only search | One request per submit: no search-as-you-type, the button is disabled while a request runs, and a cooldown follows a 429. The query is capped at 500 characters. |
| Burst limit | 10 discovery requests a minute per staff user (Workers Rate Limiting). |
| Embed only on change | Book chunks are embedded only when their text or the model changes (source hash). A demo reset reuses vectors, so it costs **0 Neurons**. |
| Query embedding cache | One embedding call per new normalised query. The vector is cached for 24 h (key: model + normalised text). |
| Result cache | The ranked ids and reasons are reused for **15 minutes** for the same normalised query, `availableOnly`, limit and catalogue version. The books are always re-read from the database, and a missing book forces a fresh run. **Never cached when `memberId` is set.** Only AI rankings are cached. |
| Skip the model | At 0 candidates, and at exactly 1 (`SINGLE_CANDIDATE`). With 2 or more the model always runs: the reasons are the product. |
| Per-user quota | **50 AI-assisted searches per staff user per UTC day** (`AI_USER_DAILY_SEARCHES`), counted with an atomic conditional upsert. Cache hits and fallbacks don't count. Past it: `QUOTA_EXCEEDED`. |
| Global cap | **8,000 Neurons per UTC day** (`AI_DAILY_NEURON_CAP`, 80 % of the free 10,000). Past it: `BUDGET_EXHAUSTED` for everyone, and query embeddings stop too (full-text only). A burst can overshoot by a few calls, which the 20 % headroom absorbs. |
| `max_tokens` 600 | Caps the output of a ranking call. |
| Reindex | Admin only, 2 a minute, embeds only missing or stale chunks. |
| CPU (Workers Free: 10 ms per call) | Reindex, the demo reset and the cron embed at most `INDEX_BATCH_BOOKS` books per call (default 8; each book is 2–3 chunks). They're idempotent and resumable: `POST /api/admin/discovery/reindex?limit=N` answers `partial` with `remaining`, and you call it again. Copies of unchanged text are plain SQL. With pgvector, only the `vector` column is written (no second `real[]` copy). |
| Dimensions | The index is `vector(768)`; `loadConfig` refuses an `EMBEDDING_MODEL` of another known size. |

**Where it lives:** Postgres, in `ai_usage(day, scope)` and `ai_cache(key, value, expires_at)` (migration `0005_ai_cost.sql`). Days are UTC. The nightly cron purges expired cache rows. The Workers Cache API isn't used because it's a no-op on `*.workers.dev` hosts. The AI Gateway isn't used either: the caches and caps above already cover it, inside our own code and tests.

**Price model.** Rates are from the Cloudflare pricing page (read 25/11/2026), in Neurons per million tokens:
- Llama 3.2 3B: 4,625 input and 30,475 output.
- bge-base: 6,058 input.

The token `usage` the model returns is used when present; otherwise text length ÷ 4. A timed-out call is charged the worst case, 26 Neurons.

| Event | Neurons |
|---|---|
| One AI search | ≈ 16 typical, ≤ 26 at worst, plus ≈ 0.1 for the query embedding (0 on a cache hit) |
| One book saved | ≈ 2.5 (2–3 chunks of about 165 tokens each) |
| Full reindex of the seed | ≈ 160 the first time (64 books → 161 chunks, ≈ 26,600 tokens at bge-base's 6,058 per million, counted as the app counts them: text length ÷ 4); 0 after a reset |
| Daily ceiling | 8,000 ≈ 300+ AI-assisted searches at worst |

**Visibility.** Every discovery log line has `neurons` (embedding + ranking), `cacheHit`, `neuronsToday`, the retrieval mode and the fallback reason, never the request text. The retrieval log adds `embeddingCacheHit` and `topSimilarity`. Admins see one line on the dashboard ("AI usage today: N / 8,000 Neurons · M AI-assisted searches") from `GET /api/admin/discovery/usage`.

## Demo queries for the assessors

Checked on the seed by `api/test/ai-cost.test.ts`, using the deterministic local embedder. Re-check on the deployed Worker, since bge decides there.

| Query | Expected book | `foundBy` | Why |
|---|---|---|---|
| `Daniel Kahnemann` (author typo) | *Thinking, Fast and Slow* | `lexical` | Trigram similarity catches the misspelt author; the vector side has nothing to match. |
| `a book for someone who is losing a parent` | *H Is for Hawk*, *Crying in H Mart* | `semantic` | Neither description has "losing" or "parent"; they talk about a father's death, a mother, grief and mourning. |
| `a memoir about grief and mourning` | *A Grief Observed* | `both` | The words match, and so does the meaning. |

## Isolation

- The rest of the app never imports the discovery module, so an AI outage can't affect borrowing, returns or search.

## Honest limits

- The model is small (3B parameters). Reasons can be generic, and ranking quality varies between requests.
- Vector search depends on the catalogue descriptions. The seed books have 180–220-word descriptions, but a book added with a short one has little "meaning" to match, and the 0.72 minimum similarity (`EMBEDDING_MIN_SIMILARITY`) for bge is a starting value that needs tuning on real queries.
- Without pgvector (local runs), vector search is a brute-force scan, and the fake embedder only knows a handful of concepts. With the quality gates (PR #29) the API tests also run the HNSW path on a pgvector image; the real model's quality is proven only on the deployed Worker (Neon).
- Search is configured for English text (English stemming and a small English stop-word list). Requests in other languages work poorly.
- The model only sees the 20 best candidates and 200 characters of each description.
- The validator checks ids, shape and length. It can't check that a reason is true about the book.
- Prompt injection is reduced (untrusted-data rules in the prompt, ids checked, text cleaned), not eliminated. What the tests prove is that an injected request still returns only real catalogue books.
- Results are not personalised beyond leaving out the member's last 5 titles.
