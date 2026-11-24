-- Search: Postgres full-text (weighted) + pg_trgm for typo tolerance (architecture §4, §6).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE books ADD COLUMN search tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(category, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(author, '')), 'C') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'D')
) STORED;

CREATE INDEX books_search_ix ON books USING gin (search);
CREATE INDEX books_title_trgm_ix ON books USING gin (title gin_trgm_ops);
CREATE INDEX books_author_trgm_ix ON books USING gin (author gin_trgm_ops);
CREATE INDEX members_name_trgm_ix ON members USING gin (full_name gin_trgm_ops);
