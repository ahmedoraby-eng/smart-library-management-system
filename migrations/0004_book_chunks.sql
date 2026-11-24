-- SLM-16: hybrid retrieval. Chunks of each book's catalogue text with their embeddings.
-- Owned by the discovery module: a derived index that can be rebuilt at any time (POST /api/admin/discovery/reindex).
-- No FK to books on purpose: the catalogue and the demo reset don't need to know about it; search joins
-- live books, and the sync removes chunks of books that no longer exist.
CREATE TABLE book_chunks (
  id          bigserial PRIMARY KEY,
  book_id     uuid        NOT NULL,
  chunk_index integer     NOT NULL,
  content     text        NOT NULL,
  source_hash text        NOT NULL,
  model       text        NOT NULL,
  embedding   real[]      NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (book_id, chunk_index)
);
CREATE INDEX book_chunks_book_id_idx ON book_chunks (book_id);

-- pgvector where the server has it (Neon). Without it (CI, embedded Postgres) search falls back to
-- brute-force cosine over `embedding` in the app; nothing else changes.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS vector';
    EXECUTE 'ALTER TABLE book_chunks ADD COLUMN embedding_v vector(768)';
    EXECUTE 'CREATE INDEX book_chunks_embedding_hnsw ON book_chunks USING hnsw (embedding_v vector_cosine_ops)';
  END IF;
END
$$;
