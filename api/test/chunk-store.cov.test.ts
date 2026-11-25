import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, type Db } from "../src/platform/db";
import { PgChunkStore, PGVECTOR_DIMENSIONS } from "../src/discovery/infrastructure/PgChunkStore";
import { pool, resetDb } from "./support";

afterAll(() => pool.end());
afterEach(() => vi.restoreAllMocks());

const MODEL = "m-1";
const store = () => new PgChunkStore(createDb(pool), 3);
async function book(title: string, opts: { available?: number; archived?: boolean; description?: string } = {}) {
  const r = await pool.query(
    `INSERT INTO books (title, author, category, description, total_copies, available_copies, archived_at) VALUES ($1,'Au','Cat',$2,3,$3,$4) RETURNING id`,
    [title, opts.description ?? `About ${title}.`, opts.available ?? 3, opts.archived ? new Date() : null],
  );
  return r.rows[0].id as string;
}
const chunk = (index: number, embedding: number[], content = `c${index}`) => ({ index, content, embedding });
const chunkRows = async () =>
  (
    await pool.query(
      "SELECT book_id, chunk_index, source_hash, model, embedding FROM book_chunks ORDER BY book_id, chunk_index",
    )
  ).rows;

beforeEach(async () => {
  await resetDb();
});

describe("PgChunkStore on plain Postgres (brute-force path)", () => {
  it("usesPgvector is false without the embedding_v column (once asked, the answer is reused)", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    expect(await store().usesPgvector()).toBe(false);
    expect(await store().usesPgvector()).toBe(false);
    expect(info.mock.calls.length).toBeLessThanOrEqual(1); // logged once per isolate (module), possibly before this test
  });

  it("liveBooks: all live books ordered by id; a list of ids filters to those (malformed ids are ignored); only malformed → none", async () => {
    const a = await book("A", { description: "" });
    const b = await book("B");
    await book("Gone", { archived: true });
    const all = await store().liveBooks();
    expect(all.map((x) => x.id)).toEqual([a, b].sort());
    expect(all.find((x) => x.id === a)).toMatchObject({ title: "A", author: "Au", category: "Cat", description: "" });
    expect((await store().liveBooks([b, "not-a-uuid", "1; DROP TABLE books"])).map((x) => x.id)).toEqual([b]);
    expect(await store().liveBooks(["not-a-uuid"])).toEqual([]);
    expect(await store().liveBooks([])).toEqual([]);
    expect(await store().liveBooks(["00000000-0000-0000-0000-000000000000"])).toEqual([]);
    const archived = (await pool.query("SELECT id FROM books WHERE archived_at IS NOT NULL")).rows[0].id as string;
    expect(await store().liveBooks([archived])).toEqual([]);
  });

  it("apply stores one array representation per chunk; indexedHashes reads one hash per book for the model; knownHashes is a set lookup", async () => {
    const a = await book("A");
    const b = await book("B");
    const removed = await store().apply(MODEL, {
      embedded: [
        { bookId: a, hash: "h-a", rows: [chunk(0, [1, 0, 0]), chunk(1, [0, 1, 0])] },
        { bookId: b, hash: "h-b", rows: [chunk(0, [0, 0, 1])] },
      ],
      copied: [],
    });
    expect(removed).toBe(0);
    const rows = await chunkRows();
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.model === MODEL && Array.isArray(r.embedding) && r.embedding.length === 3)).toBe(true);
    expect([...(await store().indexedHashes(MODEL))].sort()).toEqual(
      [
        [a, "h-a"],
        [b, "h-b"],
      ].sort(),
    );
    expect((await store().indexedHashes("other-model")).size).toBe(0);
    expect(await store().knownHashes([], MODEL)).toEqual(new Set());
    expect(await store().knownHashes(["h-a", "h-zzz"], MODEL)).toEqual(new Set(["h-a"]));
    expect(await store().knownHashes(["h-a"], "other-model")).toEqual(new Set());
  });

  it("apply: re-embedding replaces a book's chunks; an embedded book with no rows just has its chunks removed", async () => {
    const a = await book("A");
    const b = await book("B");
    await store().apply(MODEL, {
      embedded: [
        { bookId: a, hash: "h1", rows: [chunk(0, [1, 0, 0]), chunk(1, [0, 1, 0])] },
        { bookId: b, hash: "h2", rows: [chunk(0, [0, 0, 1])] },
      ],
      copied: [],
    });
    await store().apply(MODEL, {
      embedded: [
        { bookId: a, hash: "h1b", rows: [chunk(0, [1, 1, 0])] },
        { bookId: b, hash: "h2", rows: [] },
      ],
      copied: [],
    });
    const rows = await chunkRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ book_id: a, source_hash: "h1b", chunk_index: 0 });
  });

  it("apply: a copied book takes the donor's vectors (same hash and model); nothing is copied when no donor exists", async () => {
    const donor = await book("Donor");
    const twin = await book("Twin");
    const lonely = await book("Lonely");
    await store().apply(MODEL, {
      embedded: [{ bookId: donor, hash: "same", rows: [chunk(0, [1, 0, 0], "x"), chunk(1, [0, 1, 0], "y")] }],
      copied: [],
    });
    await pool.query(
      "INSERT INTO book_chunks (book_id, chunk_index, content, source_hash, model, embedding) VALUES ($1, 0, 'stale', 'old', $2, '{0,0,1}')",
      [twin, MODEL],
    );
    await store().apply(MODEL, {
      embedded: [],
      copied: [
        { bookId: twin, hash: "same" },
        { bookId: lonely, hash: "no-such-hash" },
      ],
    });
    const twinRows = (
      await pool.query(
        "SELECT chunk_index, content, source_hash, embedding FROM book_chunks WHERE book_id = $1 ORDER BY chunk_index",
        [twin],
      )
    ).rows;
    expect(twinRows.map((r) => [r.chunk_index, r.content, r.source_hash])).toEqual([
      [0, "x", "same"],
      [1, "y", "same"],
    ]);
    expect(twinRows[1]!.embedding).toEqual([0, 1, 0]);
    expect((await pool.query("SELECT 1 FROM book_chunks WHERE book_id = $1", [lonely])).rowCount).toBe(0);
  });

  it("apply: drops orphan chunks (other models, archived or missing books) and returns how many", async () => {
    const live = await book("Live");
    const old = await book("Old", { archived: true });
    await pool.query(
      "INSERT INTO book_chunks (book_id, chunk_index, content, source_hash, model, embedding) VALUES ($1,0,'o','h','other-model','{1,0,0}'), ($2,0,'o','h',$3,'{1,0,0}'), ($4,0,'o','h',$3,'{1,0,0}')",
      [live, old, MODEL, "11111111-1111-4111-8111-111111111111"],
    );
    const removed = await store().apply(MODEL, {
      embedded: [{ bookId: live, hash: "h", rows: [chunk(0, [1, 0, 0])] }],
      copied: [],
    });
    expect(removed).toBe(2); // the archived book's and the missing book's (the other-model row of `live` went with live's replacement)
    expect((await chunkRows()).map((r) => r.book_id)).toEqual([live]);
  });

  it("apply is one transaction: a failing insert leaves earlier changes undone", async () => {
    const a = await book("A");
    await store().apply(MODEL, { embedded: [{ bookId: a, hash: "h", rows: [chunk(0, [1, 0, 0])] }], copied: [] });
    await expect(
      store().apply(MODEL, {
        embedded: [
          { bookId: a, hash: "h2", rows: [chunk(0, [0, 1, 0])] },
          {
            bookId: a,
            hash: "h3",
            rows: [
              { index: 0, content: "bad", embedding: [Number.NaN, 1, 1] as number[] },
              chunk(1, ["x" as unknown as number, 1, 1]),
            ],
          },
        ],
        copied: [],
      }),
    ).rejects.toThrow();
    const rows = await chunkRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.source_hash).toBe("h"); // the first replacement was rolled back too
  });

  describe("nearest", () => {
    async function seed() {
      const near = await book("Near");
      const mid = await book("Mid");
      const far = await book("Far");
      const out = await book("OutOfStock", { available: 0 });
      const gone = await book("Archived", { archived: true });
      await store().apply(MODEL, {
        embedded: [
          { bookId: near, hash: "n", rows: [chunk(0, [0, 1, 0]), chunk(1, [1, 0, 0])] }, // best chunk (not the first) decides
          { bookId: mid, hash: "m", rows: [chunk(0, [1, 1, 0])] },
          { bookId: far, hash: "f", rows: [chunk(0, [0, 0, 1])] },
          { bookId: out, hash: "o", rows: [chunk(0, [1, 0, 0])] },
          { bookId: gone, hash: "g", rows: [chunk(0, [1, 0, 0])] },
        ],
        copied: [],
      });
      // a null embedding and another model are never searched
      await pool.query(
        "INSERT INTO book_chunks (book_id, chunk_index, content, source_hash, model, embedding) VALUES ($1, 5, 'null', 'x', $2, NULL), ($1, 6, 'x', 'x', 'other', '{1,0,0}')",
        [far, MODEL],
      );
      return { near, mid, far, out, gone };
    }

    it("ranks each live book by its best chunk, skips archived books, other models and null embeddings", async () => {
      const { near, mid, out } = await seed();
      const hits = await store().nearest([1, 0, 0], {
        model: MODEL,
        limit: 10,
        minSimilarity: 0.5,
        availableOnly: false,
      });
      expect(hits.map((h) => h.bookId).sort()).toEqual([near, out, mid].sort());
      const sims = Object.fromEntries(hits.map((h) => [h.bookId, h.similarity]));
      expect(sims[near]).toBeCloseTo(1, 10);
      expect(sims[out]).toBeCloseTo(1, 10);
      expect(sims[mid]).toBeCloseTo(Math.SQRT1_2, 10);
      expect(hits).toHaveLength(3); // far (orthogonal) is under the threshold, archived is excluded
      expect(hits.at(-1)!.bookId).toBe(mid);
    });

    it("equal similarities are ordered by book id, so results are deterministic", async () => {
      const { near, out } = await seed();
      const third = await book("Third Tie");
      const fourth = await book("Fourth Tie");
      await store().apply(MODEL, {
        embedded: [
          { bookId: near, hash: "n", rows: [chunk(0, [1, 0, 0])] },
          { bookId: out, hash: "o", rows: [chunk(0, [1, 0, 0])] },
          { bookId: third, hash: "t", rows: [chunk(0, [2, 0, 0])] },
          { bookId: fourth, hash: "f", rows: [chunk(0, [5, 0, 0])] },
        ],
        copied: [],
      });
      const hits = await store().nearest([1, 0, 0], {
        model: MODEL,
        limit: 10,
        minSimilarity: 0.99,
        availableOnly: false,
      });
      expect(hits.map((h) => h.bookId)).toEqual([near, out, third, fourth].sort());
      expect(
        await store().nearest([1, 0, 0], { model: MODEL, limit: 2, minSimilarity: 0.99, availableOnly: false }),
      ).toHaveLength(2);
    });

    it("availableOnly drops books with no copies on the shelf; limit caps the list; the threshold filters", async () => {
      const { near, mid, out } = await seed();
      const avail = await store().nearest([1, 0, 0], {
        model: MODEL,
        limit: 10,
        minSimilarity: 0.5,
        availableOnly: true,
      });
      expect(avail.map((h) => h.bookId)).toEqual([near, mid]);
      expect(avail.map((h) => h.bookId)).not.toContain(out);
      expect(
        await store().nearest([1, 0, 0], { model: MODEL, limit: 1, minSimilarity: 0, availableOnly: false }),
      ).toHaveLength(1);
      expect(
        await store().nearest([1, 0, 0], { model: MODEL, limit: 10, minSimilarity: 1.01, availableOnly: false }),
      ).toEqual([]);
      expect(
        await store().nearest([1, 0, 0], { model: "unknown-model", limit: 10, minSimilarity: 0, availableOnly: false }),
      ).toEqual([]);
    });
  });
});

describe("PgChunkStore with pgvector (SQL shape checked against a recording database; the embedded server has no pgvector)", () => {
  type Call = { sql: string; params: unknown[] };
  const dialect = new PgDialect();

  /** Fresh module state per test: the per-isolate pgvector answer is cached at module scope. */
  async function fresh(execute: (call: Call) => unknown, extra: { rowCount?: number } = {}) {
    vi.resetModules();
    const mod = await import("../src/discovery/infrastructure/PgChunkStore");
    const calls: Call[] = [];
    const run = async (q: SQL) => {
      const { sql, params } = dialect.sqlToQuery(q);
      const call = { sql, params };
      calls.push(call);
      return execute(call);
    };
    const tx = { execute: run };
    const db = { execute: run, transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) } as unknown as Db;
    return { calls, make: (dims?: number) => new mod.PgChunkStore(db, dims), ...extra };
  }
  const hasColumn = (call: Call) =>
    call.sql.includes("information_schema") ? { rows: [{ "?column?": 1 }] } : undefined;

  it("detects the column once, logs the path once, and uses it only for 768-dimension models", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const f = await fresh(hasColumn);
    expect(await f.make().usesPgvector()).toBe(true);
    expect(await f.make(PGVECTOR_DIMENSIONS).usesPgvector()).toBe(true);
    expect(await f.make(384).usesPgvector()).toBe(false); // other sizes use the array path
    expect(f.calls.filter((c) => c.sql.includes("information_schema"))).toHaveLength(1);
    expect(info).toHaveBeenCalledTimes(1);
    expect(JSON.parse(info.mock.calls[0]![0] as string)).toMatchObject({ event: "vector_search_path", path: "hnsw" });
  });

  it("a failed column check is not cached: the next call asks again", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    let first = true;
    const f = await fresh((call) => {
      if (first) {
        first = false;
        throw new Error("db unreachable");
      }
      return hasColumn(call);
    });
    await expect(f.make().usesPgvector()).rejects.toThrow("db unreachable");
    await new Promise((r) => setTimeout(r, 0)); // let the cache-reset handler run
    expect(await f.make().usesPgvector()).toBe(true);
    expect(f.calls.filter((c) => c.sql.includes("information_schema"))).toHaveLength(2);
  });

  it("nearest queries the HNSW column with a vector literal, the pool factor, threshold, and optional availability filter", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const f = await fresh((call) =>
      call.sql.includes("information_schema")
        ? hasColumn(call)
        : {
            rows: [
              { book_id: "b1", similarity: "0.91" },
              { book_id: "b2", similarity: 0.8 },
            ],
          },
    );
    const hits = await f.make().nearest([0.5, 0.25], { model: "m", limit: 4, minSimilarity: 0.7, availableOnly: true });
    expect(hits).toEqual([
      { bookId: "b1", similarity: 0.91 },
      { bookId: "b2", similarity: 0.8 },
    ]);
    const q = f.calls.at(-1)!;
    expect(q.sql).toContain("<=>");
    expect(q.sql).toContain("b.available_copies > 0");
    expect(q.params).toEqual(expect.arrayContaining(["[0.5,0.25]", "m", 8, 0.7, 4])); // limit × 2 chunks read, then limit books
    await f.make().nearest([1], { model: "m", limit: 4, minSimilarity: 0.7, availableOnly: false });
    expect(f.calls.at(-1)!.sql).not.toContain("available_copies");
  });

  it("apply writes the vector column only (no array copy) and copies both columns from the donor", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const f = await fresh((call) =>
      call.sql.includes("information_schema")
        ? hasColumn(call)
        : {
            rows: [],
            rowCount:
              call.sql.startsWith("delete from book_chunks c") || call.sql.includes("DELETE FROM book_chunks c")
                ? 7
                : 0,
          },
    );
    const removed = await f.make().apply("m", {
      embedded: [
        { bookId: "e1", hash: "he", rows: [chunk(0, [1, 2]), chunk(1, [3, 4])] },
        { bookId: "e2", hash: "h2", rows: [] },
      ],
      copied: [{ bookId: "c1", hash: "hc" }],
    });
    expect(removed).toBe(7);
    const writes = f.calls.filter((c) => !c.sql.includes("information_schema"));
    const copy = writes.find((c) => c.sql.includes("INSERT INTO book_chunks") && c.sql.includes("SELECT"))!;
    expect(copy.sql).toContain("(book_id, chunk_index, content, source_hash, model, embedding, embedding_v)");
    expect(copy.sql).toMatch(/model, embedding, embedding_v FROM book_chunks/);
    const insert = writes.find((c) => c.sql.includes("VALUES"))!;
    expect(insert.sql).toContain("::vector");
    expect(insert.params).toEqual(expect.arrayContaining(["[1,2]", "[3,4]"]));
    // copies run before embeds; the empty book only has its chunks deleted
    const kinds = writes.map((c) =>
      /^\s*delete/i.test(c.sql) ? "delete" : c.sql.includes("VALUES") ? "insert" : "copy",
    );
    expect(kinds).toEqual(["delete", "copy", "delete", "insert", "delete", "delete"]);
  });

  it("liveBooks maps a missing description to null (defensive: the column is NOT NULL in the real schema)", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const f = await fresh(() => ({ rows: [{ id: "1", title: "T", author: "A", category: "C", description: null }] }));
    expect(await f.make().liveBooks()).toEqual([
      { id: "1", title: "T", author: "A", category: "C", description: null },
    ]);
  });

  it("without rows to write, apply only prunes orphans (rowCount missing counts as 0)", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const f = await fresh((call) => (call.sql.includes("information_schema") ? hasColumn(call) : { rows: [] }));
    expect(await f.make().apply("m", { embedded: [], copied: [] })).toBe(0);
  });
});
