import type { SimilarBooksResponse } from "@slm/contracts";
import type { CatalogRetrieval, Embedder } from "../domain/Discovery";
import type { ChunkStore } from "../domain/Indexing";

/** SLM-19: how many books the "More like this" strip shows. */
export const SIMILAR_BOOKS_LIMIT = 4;

/**
 * SLM-19 "More like this": the catalogue books closest in meaning to a given book, from the vectors already
 * stored in `book_chunks` (the mean of the book's own chunks against every other live book's chunks).
 * No model call, so no Neurons and no quota: indexing paid for the vectors once.
 * The books (title, author, availability) are re-read from the catalogue, as discovery always does.
 * Not indexed yet, archived, or vector search off → an empty list (the UI hides the section).
 */
export class SimilarBooks {
  constructor(
    private readonly store: ChunkStore,
    private readonly catalog: Pick<CatalogRetrieval, "summaries">,
    private readonly embedder: Pick<Embedder, "model"> | null,
  ) {}

  async forBook(bookId: string, limit = SIMILAR_BOOKS_LIMIT): Promise<SimilarBooksResponse> {
    if (!this.embedder) return { items: [] };
    const hits = await this.store.similarTo(bookId, { model: this.embedder.model, limit });
    if (hits.length === 0) return { items: [] };
    const books = await this.catalog.summaries(hits.map((h) => h.bookId));
    return {
      items: hits.flatMap((h) => {
        const book = books.get(h.bookId);
        // A book archived between the two reads is simply left out.
        return book ? [{ book, similarity: Math.round(h.similarity * 1000) / 1000 }] : [];
      }),
    };
  }
}
