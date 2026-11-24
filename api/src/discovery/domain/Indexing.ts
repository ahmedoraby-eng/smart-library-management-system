import type { BookText } from "./Chunking";

/** A live (non-archived) book's catalogue text, as the index sees it. */
export interface IndexableBook extends BookText {
  id: string;
}

export interface ChunkRow {
  index: number;
  content: string;
  embedding: number[];
}

/** One book's best-matching chunk for a query vector. */
export interface VectorHit {
  bookId: string;
  similarity: number;
}

/**
 * Port to the `book_chunks` store (SLM-16). pgvector + HNSW where the server has it; otherwise a
 * brute-force cosine scan in the app (CI, embedded Postgres). Same contract either way.
 */
export interface ChunkStore {
  /** Live books, optionally only these ids. */
  liveBooks(ids?: string[]): Promise<IndexableBook[]>;
  /** source_hash per indexed book (for the given model). */
  indexedHashes(model: string): Promise<Map<string, string>>;
  /** Replaces all chunks of one book (one transaction). */
  replaceBook(bookId: string, chunks: ChunkRow[], sourceHash: string, model: string): Promise<void>;
  /** Removes chunks of books that are gone or archived, and chunks made with another model. Returns rows removed. */
  removeOrphans(model: string): Promise<number>;
  /** Books whose best chunk is closest to the query vector, best first. */
  nearest(query: number[], opts: { model: string; limit: number; minSimilarity: number; availableOnly: boolean }): Promise<VectorHit[]>;
  /** True when the server has pgvector (the HNSW path). */
  usesPgvector(): Promise<boolean>;
}
