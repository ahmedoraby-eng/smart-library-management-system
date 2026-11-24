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
  /** Of these source hashes, those that some chunk already has (vectors that can be copied, not re-embedded). */
  knownHashes(hashes: string[], model: string): Promise<Set<string>>;
  /**
   * One transaction: replace the chunks of `embedded` books with the new rows, give `copied` books the
   * chunks of another book with the same source hash, then drop orphan chunks (gone/archived books,
   * other models). Returns the number of orphan rows removed.
   */
  apply(model: string, change: {
    embedded: Array<{ bookId: string; hash: string; rows: ChunkRow[] }>;
    copied: Array<{ bookId: string; hash: string }>;
  }): Promise<number>;
  /** Books whose best chunk is closest to the query vector, best first. */
  nearest(query: number[], opts: { model: string; limit: number; minSimilarity: number; availableOnly: boolean }): Promise<VectorHit[]>;
  /** True when the server has pgvector (the HNSW path). */
  usesPgvector(): Promise<boolean>;
}
