import { sql } from "drizzle-orm";
import type { Db } from "../../platform/db";
import { cosine } from "../domain/Fusion";
import type { ChunkRow, ChunkStore, IndexableBook, VectorHit } from "../domain/Indexing";

/** How many nearest chunks the vector query reads before grouping by book. */
const CHUNK_POOL_FACTOR = 2;
/** Per isolate: whether `book_chunks.embedding_v` exists. Asked once, then reused by every request. */
let pgvectorColumn: Promise<boolean> | null = null;
/** pgvector's column is vector(768); any other size must use the array path (and loadConfig refuses it anyway). */
export const PGVECTOR_DIMENSIONS = 768;
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
  constructor(private readonly db: Db, private readonly dimensions = PGVECTOR_DIMENSIONS) {}

  async usesPgvector(): Promise<boolean> {
    if (!pgvectorColumn) {
      const asked = this.db
        .execute(sql`SELECT 1 FROM information_schema.columns WHERE table_name = 'book_chunks' AND column_name = 'embedding_v'`)
        .then((r) => {
          const yes = r.rows.length > 0;
          console.info(JSON.stringify({ level: "info", event: "vector_search_path", path: yes ? "hnsw" : "brute-force" })); // once per isolate
          return yes;
        });
      pgvectorColumn = asked;
      asked.catch(() => { if (pgvectorColumn === asked) pgvectorColumn = null; }); // a failed check is asked again
    }
    return (await pgvectorColumn) && this.dimensions === PGVECTOR_DIMENSIONS;
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

  async knownHashes(hashes: string[], model: string): Promise<Set<string>> {
    if (hashes.length === 0) return new Set();
    const { rows } = await this.db.execute(sql`SELECT DISTINCT source_hash FROM book_chunks
      WHERE model = ${model} AND source_hash IN (${sql.join(hashes.map((h) => sql`${h}`), sql`, `)})`);
    return new Set(rows.map((r) => r.source_hash as string));
  }

  async apply(model: string, change: { embedded: Array<{ bookId: string; hash: string; rows: ChunkRow[] }>; copied: Array<{ bookId: string; hash: string }> }): Promise<number> {
    const pgvector = await this.usesPgvector();
    const cols = pgvector
      ? sql`(book_id, chunk_index, content, source_hash, model, embedding, embedding_v)`
      : sql`(book_id, chunk_index, content, source_hash, model, embedding)`;
    return this.db.transaction(async (tx) => {
      // Copies first: their donor rows may belong to books that are about to be removed as orphans (demo reset).
      for (const c of change.copied) {
        await tx.execute(sql`DELETE FROM book_chunks WHERE book_id = ${c.bookId}::uuid`);
        const src = pgvector ? sql`embedding, embedding_v` : sql`embedding`;
        await tx.execute(sql`INSERT INTO book_chunks ${cols}
          SELECT ${c.bookId}::uuid, chunk_index, content, source_hash, model, ${src} FROM book_chunks
          WHERE model = ${model} AND book_id = (
            SELECT book_id FROM book_chunks WHERE source_hash = ${c.hash} AND model = ${model} AND book_id <> ${c.bookId}::uuid LIMIT 1)
          ON CONFLICT (book_id, chunk_index, model) DO NOTHING`);
      }
      for (const e of change.embedded) {
        await tx.execute(sql`DELETE FROM book_chunks WHERE book_id = ${e.bookId}::uuid`);
        if (e.rows.length === 0) continue;
        // One representation only (less CPU): the vector column with pgvector, the array without.
        const values = e.rows.map((c) => pgvector
          ? sql`(${e.bookId}::uuid, ${c.index}, ${c.content}, ${e.hash}, ${model}, NULL, ${vectorLiteral(c.embedding)}::vector)`
          : sql`(${e.bookId}::uuid, ${c.index}, ${c.content}, ${e.hash}, ${model}, ${arrayLiteral(c.embedding)}::real[])`);
        await tx.execute(sql`INSERT INTO book_chunks ${cols} VALUES ${sql.join(values, sql`, `)}
          ON CONFLICT (book_id, chunk_index, model) DO NOTHING`);
      }
      const r = await tx.execute(sql`DELETE FROM book_chunks c
        WHERE c.model <> ${model}
           OR NOT EXISTS (SELECT 1 FROM books b WHERE b.id = c.book_id AND b.archived_at IS NULL)`);
      return r.rowCount ?? 0;
    });
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
      WHERE c.model = ${opts.model} AND c.embedding IS NOT NULL`);
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
