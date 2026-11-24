import { sql } from "drizzle-orm";
import type { Db } from "../../platform/db";
import { cosine } from "../domain/Fusion";
import type { ChunkRow, ChunkStore, IndexableBook, VectorHit } from "../domain/Indexing";

/** How many nearest chunks the vector query reads before grouping by book. */
const CHUNK_POOL_FACTOR = 2;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const vectorLiteral = (v: number[]) => `[${v.join(",")}]`;
/** Postgres array literal: one parameter (Drizzle would spread a JS array into a tuple). */
const arrayLiteral = (v: number[]) => `{${v.join(",")}}`;

/**
 * `book_chunks` (migration 0004). With pgvector (Neon): `embedding_v vector(768)` + HNSW cosine index,
 * queried with `<=>`. Without it (CI, embedded Postgres): only `embedding real[]` exists and `nearest`
 * scans it in the app; fine for a demo-size catalogue, never used where pgvector is present.
 * Reads `books` by name for live text and availability (the read-model exception, as for retrieval).
 */
export class PgChunkStore implements ChunkStore {
  private pgvector: Promise<boolean> | null = null;
  constructor(private readonly db: Db) {}

  usesPgvector(): Promise<boolean> {
    this.pgvector ??= this.db
      .execute(sql`SELECT 1 FROM information_schema.columns WHERE table_name = 'book_chunks' AND column_name = 'embedding_v'`)
      .then((r) => r.rows.length > 0);
    return this.pgvector;
  }

  async liveBooks(ids?: string[]): Promise<IndexableBook[]> {
    const only = ids ? ids.filter((i) => UUID.test(i)) : null;
    if (only && only.length === 0) return [];
    const filter = only ? sql`AND id IN (${sql.join(only.map((i) => sql`${i}::uuid`), sql`, `)})` : sql``;
    const { rows } = await this.db.execute(sql`SELECT id, title, author, category, description FROM books WHERE archived_at IS NULL ${filter} ORDER BY id`);
    return rows.map((r) => ({
      id: r.id as string, title: r.title as string, author: r.author as string, category: r.category as string,
      description: (r.description as string | null) ?? null,
    }));
  }

  async indexedHashes(model: string): Promise<Map<string, string>> {
    const { rows } = await this.db.execute(sql`SELECT DISTINCT ON (book_id) book_id, source_hash FROM book_chunks WHERE model = ${model} ORDER BY book_id, chunk_index`);
    return new Map(rows.map((r) => [r.book_id as string, r.source_hash as string]));
  }

  async replaceBook(bookId: string, chunks: ChunkRow[], sourceHash: string, model: string): Promise<void> {
    const pgvector = await this.usesPgvector();
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`DELETE FROM book_chunks WHERE book_id = ${bookId}::uuid`);
      if (chunks.length === 0) return;
      const values = chunks.map((c) => pgvector
        ? sql`(${bookId}::uuid, ${c.index}, ${c.content}, ${sourceHash}, ${model}, ${arrayLiteral(c.embedding)}::real[], ${vectorLiteral(c.embedding)}::vector)`
        : sql`(${bookId}::uuid, ${c.index}, ${c.content}, ${sourceHash}, ${model}, ${arrayLiteral(c.embedding)}::real[])`);
      const cols = pgvector
        ? sql`(book_id, chunk_index, content, source_hash, model, embedding, embedding_v)`
        : sql`(book_id, chunk_index, content, source_hash, model, embedding)`;
      await tx.execute(sql`INSERT INTO book_chunks ${cols} VALUES ${sql.join(values, sql`, `)}`);
    });
  }

  async removeOrphans(model: string): Promise<number> {
    const r = await this.db.execute(sql`DELETE FROM book_chunks c
      WHERE c.model <> ${model}
         OR NOT EXISTS (SELECT 1 FROM books b WHERE b.id = c.book_id AND b.archived_at IS NULL)`);
    return r.rowCount ?? 0;
  }

  async nearest(query: number[], opts: { model: string; limit: number; minSimilarity: number; availableOnly: boolean }): Promise<VectorHit[]> {
    const avail = opts.availableOnly ? sql`AND b.available_copies > 0` : sql``;
    if (await this.usesPgvector()) {
      // HNSW finds the nearest chunks; then best chunk per live book. Similarity = 1 − cosine distance.
      const v = vectorLiteral(query);
      const { rows } = await this.db.execute(sql`SELECT n.book_id, max(n.similarity) AS similarity
        FROM (
          SELECT c.book_id, 1 - (c.embedding_v <=> ${v}::vector) AS similarity
          FROM book_chunks c
          WHERE c.model = ${opts.model}
          ORDER BY c.embedding_v <=> ${v}::vector
          LIMIT ${opts.limit * CHUNK_POOL_FACTOR}
        ) n
        JOIN books b ON b.id = n.book_id AND b.archived_at IS NULL ${avail}
        GROUP BY n.book_id
        HAVING max(n.similarity) >= ${opts.minSimilarity}
        ORDER BY similarity DESC, n.book_id
        LIMIT ${opts.limit}`);
      return rows.map((r) => ({ bookId: r.book_id as string, similarity: Number(r.similarity) }));
    }

    // No pgvector: exact cosine over every chunk of live books.
    const { rows } = await this.db.execute(sql`SELECT c.book_id, c.embedding FROM book_chunks c
      JOIN books b ON b.id = c.book_id AND b.archived_at IS NULL ${avail}
      WHERE c.model = ${opts.model}`);
    const best = new Map<string, number>();
    for (const r of rows) {
      const s = cosine(query, (r.embedding as number[]).map(Number));
      const id = r.book_id as string;
      if (s > (best.get(id) ?? -Infinity)) best.set(id, s);
    }
    return [...best.entries()]
      .filter(([, s]) => s >= opts.minSimilarity)
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, opts.limit)
      .map(([bookId, similarity]) => ({ bookId, similarity }));
  }
}
