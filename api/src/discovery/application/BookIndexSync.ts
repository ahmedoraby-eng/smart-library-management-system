import { chunkBook, sourceKey } from "../domain/Chunking";
import { estimateTokens, neuronsFor, sha256, type AiBudget } from "../domain/Cost";
import type { Embedder } from "../domain/Discovery";
import type { ChunkRow, ChunkStore, IndexableBook } from "../domain/Indexing";

export const BOOK_SYNC_TIMEOUT_MS = 2000;

export interface SyncResult {
  /** Books whose chunks were embedded by the model (costs Neurons). */
  embeddedBooks: number;
  /** Chunks embedded by the model. */
  chunks: number;
  /** Books whose vectors were copied from an identical text (demo reset: 0 Neurons). */
  reusedBooks: number;
  upToDate: number;
  removed: number;
  neurons: number;
  /** Stale books left for the next call (embedding is batched: Workers Free allows 10 ms CPU per call). */
  remaining: number;
  /** Live books in the catalogue (the denominator of a progress bar: done = total − remaining). */
  total: number;
}

/** Books embedded per call when the caller gives no batch size. */
export const DEFAULT_BATCH_BOOKS = 8; // 2–3 chunks per book → ≤ 24 vectors per call (Workers Free: 10 ms CPU)

/**
 * SLM-16 indexing: keeps `book_chunks` in step with the catalogue at the lowest cost.
 * - Unchanged text (same source hash) is never re-embedded.
 * - Changed ids with unchanged text (the demo reset) copy existing vectors: 0 Neurons.
 * - Only truly new text calls the model, in batches; the Neurons go into the daily budget.
 * Runs after a book is created, edited or archived, after a demo reset, and from the admin reindex.
 * No embedder (no AI binding) → nothing to do; search is then full-text only.
 */
export class BookIndexSync {
  constructor(
    private readonly store: ChunkStore,
    private readonly embedder: Embedder | null,
    private readonly log: (entry: Record<string, unknown>) => void = () => undefined,
    private readonly budget: AiBudget | null = null,
  ) {}

  get enabled(): boolean {
    return this.embedder !== null;
  }

  /** "hnsw" where pgvector is installed (Neon), "brute-force" otherwise; null when vector search is off. */
  async vectorPath(): Promise<"hnsw" | "brute-force" | null> {
    if (!this.embedder) return null;
    return (await this.store.usesPgvector()) ? "hnsw" : "brute-force";
  }

  /** Every live book; returns what was done. Throws on failure (the admin endpoint reports it). */
  /**
   * Every live book, in batches: copies (same text) are always done, at most `maxEmbedBooks` books call
   * the model. Idempotent and resumable: call again while `remaining` > 0. Throws on failure.
   */
  async syncAll(maxEmbedBooks = DEFAULT_BATCH_BOOKS): Promise<SyncResult> {
    if (!this.embedder)
      return {
        embeddedBooks: 0,
        chunks: 0,
        reusedBooks: 0,
        upToDate: 0,
        removed: 0,
        neurons: 0,
        remaining: 0,
        total: 0,
      };
    return this.sync(await this.store.liveBooks(), maxEmbedBooks);
  }

  /** One book, best effort: never throws, gives up after a timeout (the next sync catches up). */
  async syncBookSafely(bookId: string, timeoutMs = BOOK_SYNC_TIMEOUT_MS): Promise<void> {
    if (!this.embedder) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const books = await this.store.liveBooks([bookId]);
      await Promise.race([
        this.sync(books, 1),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
        }),
      ]);
    } catch (e) {
      this.log({ level: "warn", event: "book_index_sync_failed", reason: e instanceof Error ? e.message : "error" });
    } finally {
      clearTimeout(timer);
    }
  }

  /** After a demo reset: re-index everything, never failing the reset itself. */
  async syncAllSafely(maxEmbedBooks = DEFAULT_BATCH_BOOKS): Promise<SyncResult | null> {
    try {
      const r = await this.syncAll(maxEmbedBooks);
      // The hourly top-up usually finds nothing to do: log only real work.
      if (r.embeddedBooks || r.reusedBooks || r.removed || r.remaining)
        this.log({ level: "info", event: "book_index_sync", ...r });
      return r;
    } catch (e) {
      this.log({ level: "warn", event: "book_index_sync_failed", reason: e instanceof Error ? e.message : "error" });
      return null;
    }
  }

  private async sync(books: IndexableBook[], maxEmbedBooks: number): Promise<SyncResult> {
    const embedder = this.embedder!;
    const indexed = await this.store.indexedHashes(embedder.model);
    const stale: Array<{ book: IndexableBook; hash: string }> = [];
    for (const book of books) {
      const hash = await sha256(sourceKey(book, embedder.model));
      if (indexed.get(book.id) !== hash) stale.push({ book, hash });
    }

    // Same text already embedded under another id (demo reset): copy, don't pay again.
    const known = await this.store.knownHashes([...new Set(stale.map((s) => s.hash))], embedder.model);
    const copied = stale.filter((s) => known.has(s.hash));
    const needEmbedding = stale.filter((s) => !known.has(s.hash));
    const toEmbed = needEmbedding
      .slice(0, Math.max(maxEmbedBooks, 0))
      .map((s) => ({ ...s, chunks: chunkBook(s.book) }));

    let neurons = 0;
    const embedded: Array<{ bookId: string; hash: string; rows: ChunkRow[] }> = [];
    if (toEmbed.length > 0) {
      const texts = toEmbed.flatMap((s) => s.chunks);
      const vectors = await embedder.embed(texts);
      neurons = neuronsFor({
        model: embedder.model,
        inputTokens: texts.reduce((n, t) => n + estimateTokens(t), 0),
        outputTokens: 0,
        estimated: true,
      });
      let at = 0;
      for (const s of toEmbed) {
        embedded.push({
          bookId: s.book.id,
          hash: s.hash,
          rows: s.chunks.map((content, index) => ({ index, content, embedding: vectors[at + index]! })),
        });
        at += s.chunks.length;
      }
    }

    const removed = await this.store.apply(embedder.model, {
      embedded,
      copied: copied.map((s) => ({ bookId: s.book.id, hash: s.hash })),
    });
    if (neurons > 0) await this.budget?.addNeurons(neurons).catch(() => undefined);
    return {
      embeddedBooks: embedded.length,
      chunks: embedded.reduce((n, e) => n + e.rows.length, 0),
      reusedBooks: copied.length,
      upToDate: books.length - stale.length,
      removed,
      neurons: Math.round(neurons * 1000) / 1000,
      remaining: needEmbedding.length - toEmbed.length,
      total: books.length,
    };
  }
}
