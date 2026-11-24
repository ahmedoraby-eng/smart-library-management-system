import { chunkBook, sourceKey } from "../domain/Chunking";
import type { Embedder } from "../domain/Discovery";
import type { ChunkStore, IndexableBook } from "../domain/Indexing";

export const BOOK_SYNC_TIMEOUT_MS = 2000;

export interface SyncResult {
  embeddedBooks: number;
  chunks: number;
  upToDate: number;
  removed: number;
}

async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * SLM-16 indexing: keeps `book_chunks` in step with the catalogue. Only books whose text (or the
 * embedding model) changed are re-chunked and re-embedded; chunks of removed or archived books go.
 * Runs after a book is created or edited, after a demo reset, and from the admin reindex endpoint.
 * No embedder (no AI binding) → nothing to do; search is then full-text only.
 */
export class BookIndexSync {
  constructor(
    private readonly store: ChunkStore,
    private readonly embedder: Embedder | null,
    private readonly log: (entry: Record<string, unknown>) => void = () => undefined,
  ) {}

  get enabled(): boolean {
    return this.embedder !== null;
  }

  /** Every live book; returns what was done. Throws on failure (the admin endpoint reports it). */
  async syncAll(): Promise<SyncResult> {
    if (!this.embedder) return { embeddedBooks: 0, chunks: 0, upToDate: 0, removed: 0 };
    const removed = await this.store.removeOrphans(this.embedder.model);
    const result = await this.sync(await this.store.liveBooks());
    return { ...result, removed };
  }

  /** One book, best effort: never throws, gives up after a timeout (the next sync catches up). */
  async syncBookSafely(bookId: string, timeoutMs = BOOK_SYNC_TIMEOUT_MS): Promise<void> {
    if (!this.embedder) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const books = await this.store.liveBooks([bookId]);
      await Promise.race([
        books.length ? this.sync(books) : this.store.removeOrphans(this.embedder.model),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), timeoutMs); }),
      ]);
    } catch (e) {
      this.log({ level: "warn", event: "book_index_sync_failed", reason: e instanceof Error ? e.message : "error" });
    } finally {
      clearTimeout(timer);
    }
  }

  /** After a demo reset: re-index everything, never failing the reset itself. */
  async syncAllSafely(): Promise<SyncResult | null> {
    try {
      const r = await this.syncAll();
      this.log({ level: "info", event: "book_index_sync", ...r });
      return r;
    } catch (e) {
      this.log({ level: "warn", event: "book_index_sync_failed", reason: e instanceof Error ? e.message : "error" });
      return null;
    }
  }

  private async sync(books: IndexableBook[]): Promise<Omit<SyncResult, "removed">> {
    const embedder = this.embedder!;
    const indexed = await this.store.indexedHashes(embedder.model);
    const stale: Array<{ book: IndexableBook; hash: string; chunks: string[] }> = [];
    for (const book of books) {
      const hash = await sha256(sourceKey(book, embedder.model));
      if (indexed.get(book.id) !== hash) stale.push({ book, hash, chunks: chunkBook(book) });
    }
    if (stale.length === 0) return { embeddedBooks: 0, chunks: 0, upToDate: books.length };

    // One batched embedding run for all stale chunks (the embedder splits it into API-sized calls).
    const vectors = await embedder.embed(stale.flatMap((s) => s.chunks));
    let at = 0;
    for (const s of stale) {
      const rows = s.chunks.map((content, index) => ({ index, content, embedding: vectors[at + index]! }));
      at += s.chunks.length;
      await this.store.replaceBook(s.book.id, rows, s.hash, embedder.model);
    }
    return { embeddedBooks: stale.length, chunks: at, upToDate: books.length - stale.length };
  }
}
