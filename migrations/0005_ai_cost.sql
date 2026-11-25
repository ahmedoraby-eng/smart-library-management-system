-- SLM-16 cost controls. Daily AI usage (UTC days) and a small TTL cache, both in Postgres
-- (the Workers Cache API is a no-op on *.workers.dev hosts).

-- scope = 'global' (the daily Neuron cap) or 'user:<staff id>' (the per-user search quota).
CREATE TABLE ai_usage (
  day      date          NOT NULL,
  scope    text          NOT NULL,
  searches integer       NOT NULL DEFAULT 0,
  neurons  numeric(12,3) NOT NULL DEFAULT 0,
  PRIMARY KEY (day, scope)
);

-- Query embeddings and ranked results (ids + reasons only; books are always re-read from the catalogue).
CREATE TABLE ai_cache (
  key        text        PRIMARY KEY,
  value      jsonb       NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX ai_cache_expires_at_idx ON ai_cache (expires_at);
