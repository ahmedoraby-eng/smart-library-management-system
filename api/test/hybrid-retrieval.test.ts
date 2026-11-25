import type { DiscoveryResponse } from "@slm/contracts";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { BookDiscoveryService } from "../src/discovery/application/BookDiscoveryService";
import { BookIndexSync } from "../src/discovery/application/BookIndexSync";
import { HybridCatalogRetrieval, type RetrievalLog } from "../src/discovery/application/HybridCatalogRetrieval";
import { chunkBook, MAX_WORDS, sentences } from "../src/discovery/domain/Chunking";
import type { Embedder } from "../src/discovery/domain/Discovery";
import { cosine, reciprocalRankFusion, RRF_K } from "../src/discovery/domain/Fusion";
import { FakeEmbedder } from "../src/discovery/infrastructure/FakeEmbedder";
import { PgCatalogRetrieval } from "../src/discovery/infrastructure/PgCatalogRetrieval";
import { PgChunkStore } from "../src/discovery/infrastructure/PgChunkStore";
import { WorkersAiEmbedder } from "../src/discovery/infrastructure/WorkersAiEmbedder";
import { createDb } from "../src/platform/db";
import { as, pool, resetDb, seedStaff, testApp } from "./support";

afterAll(() => pool.end());

const SYNONYM_QUERY = "a book for someone who is losing a parent";

// ── Chunking ────────────────────────────────────────────────────────────────────────────────────────
describe("SLM-16 chunking", () => {
  const book = { title: "H Is for Hawk", author: "Helen Macdonald", category: "Memoir" };

  it("a short description is one chunk with the book header first", () => {
    const chunks = chunkBook({ ...book, description: "After her father's sudden death, a naturalist trains a goshawk." });
    expect(chunks).toEqual(["H Is for Hawk — Helen Macdonald (Memoir)\nAfter her father's sudden death, a naturalist trains a goshawk."]);
  });

  it("no description still gives one chunk (the header), so every book is searchable", () => {
    expect(chunkBook({ ...book, description: null })).toEqual(["H Is for Hawk — Helen Macdonald (Memoir)"]);
    expect(chunkBook({ ...book, description: "   " })).toHaveLength(1);
  });

  it("long text is packed into windows of at most MAX_WORDS words with one sentence of overlap", () => {
    const sents = Array.from({ length: 30 }, (_, i) => `Sentence number ${i + 1} has exactly eight words here.`);
    const chunks = chunkBook({ ...book, description: sents.join(" ") });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      const body = c.split("\n")[1]!;
      expect(body.split(/\s+/).length).toBeLessThanOrEqual(MAX_WORDS);
      expect(c.startsWith("H Is for Hawk — Helen Macdonald (Memoir)\n")).toBe(true);
    }
    // Overlap: each window starts with the last sentence of the previous one.
    for (let i = 1; i < chunks.length; i++) {
      const prev = sentences(chunks[i - 1]!.split("\n")[1]!);
      const next = sentences(chunks[i]!.split("\n")[1]!);
      expect(next[0]).toBe(prev[prev.length - 1]);
    }
    // Nothing lost: every sentence appears in some chunk.
    for (const s of sents) expect(chunks.some((c) => c.includes(s))).toBe(true);
  });

  it("a single sentence longer than the window is cut, and chunking always terminates", () => {
    const long = Array.from({ length: 300 }, (_, i) => `w${i}`).join(" ");
    const chunks = chunkBook({ ...book, description: long });
    expect(chunks.length).toBe(Math.ceil(300 / MAX_WORDS));
    expect(chunks.join(" ")).toContain("w299");
  });
});

// ── Fusion ──────────────────────────────────────────────────────────────────────────────────────────
describe("SLM-16 Reciprocal Rank Fusion", () => {
  const id = (s: string) => s;

  it("scores by 1/(k + rank), marks which retriever found each item, best first", () => {
    const fused = reciprocalRankFusion(["a", "b", "c"], ["c", "d"], id, 20);
    expect(fused.map((f) => [f.item, f.foundBy])).toEqual([["c", "both"], ["a", "lexical"], ["b", "lexical"], ["d", "semantic"]]);
    expect(fused[0]!.score).toBeCloseTo(1 / (RRF_K + 3) + 1 / (RRF_K + 1));
    expect(fused[0]).toMatchObject({ lexicalRank: 3, semanticRank: 1 });
  });

  it("a tie goes to the better lexical rank; duplicates count once; the result is capped", () => {
    // b (lexical #2) and d (semantic #2) tie at 1/(k+2): b first.
    expect(reciprocalRankFusion(["a", "b", "b"], ["x", "d", "d"], id, 20).map((f) => f.item)).toEqual(["a", "x", "b", "d"]);
    expect(reciprocalRankFusion(["a", "b", "c"], ["d", "e"], id, 2)).toHaveLength(2);
    expect(reciprocalRankFusion([], [], id, 20)).toEqual([]);
  });

  it("cosine similarity", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});

// ── Index + hybrid retrieval on Postgres (brute-force path here; pgvector + HNSW on Neon) ───────────
const ids: Record<string, string> = {};
async function addBook(key: string, title: string, author: string, category: string, description: string, available = 2) {
  const r = await pool.query(
    `INSERT INTO books (title, author, category, description, total_copies, available_copies) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [title, author, category, description, Math.max(available, 1), available],
  );
  ids[key] = r.rows[0].id;
}

const db = () => createDb(pool);
const store = () => new PgChunkStore(db());
const lexical = () => new PgCatalogRetrieval(db());

let staff: Awaited<ReturnType<typeof seedStaff>>;
beforeEach(async () => {
  await resetDb();
  staff = await seedStaff();
  await addBook("hawk", "H Is for Hawk", "Helen Macdonald", "Memoir", "After her father's sudden death, a naturalist trains a goshawk and works through her grief.");
  await addBook("hmart", "Crying in H Mart", "Michelle Zauner", "Memoir", "A musician remembers her Korean mother through food, illness and mourning.");
  await addBook("clean", "Clean Code", "Robert C. Martin", "Programming", "A handbook of agile software craftsmanship: naming, functions, tests and readable code.");
  await addBook("cosmos", "Cosmos", "Carl Sagan", "Science", "A tour of the universe, the stars and our place among the galaxies.");
});

describe("SLM-16 indexing (book_chunks)", () => {
  it("syncAll chunks and embeds every live book once; a second run finds them up to date", async () => {
    const sync = new BookIndexSync(store(), new FakeEmbedder());
    expect(await sync.syncAll()).toMatchObject({ embeddedBooks: 4, chunks: 4, upToDate: 0 });
    expect(await sync.syncAll()).toMatchObject({ embeddedBooks: 0, upToDate: 4 });
    const { rows } = await pool.query("SELECT book_id, content, model, array_length(embedding, 1) AS dims FROM book_chunks");
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.model === "fake-embedding-v1" && r.dims === 768)).toBe(true);
  });

  it("only a book whose text changed is re-embedded; an archived book's chunks are removed", async () => {
    const sync = new BookIndexSync(store(), new FakeEmbedder());
    await sync.syncAll();
    await pool.query("UPDATE books SET description = 'A new description about stars.' WHERE id = $1", [ids.cosmos]);
    await pool.query("UPDATE books SET archived_at = now() WHERE id = $1", [ids.clean]);
    expect(await sync.syncAll()).toMatchObject({ embeddedBooks: 1, upToDate: 2, removed: 1 });
    const { rows } = await pool.query("SELECT content FROM book_chunks WHERE book_id = $1", [ids.cosmos]);
    expect(rows[0].content).toContain("A new description about stars.");
  });

  it("chunks made with another model are stale and replaced", async () => {
    await new BookIndexSync(store(), new FakeEmbedder()).syncAll();
    const other: Embedder = Object.assign(new FakeEmbedder(), { model: "fake-embedding-v2" });
    expect(await new BookIndexSync(store(), other).syncAll()).toMatchObject({ embeddedBooks: 4, chunks: 4 });
    const { rows } = await pool.query("SELECT DISTINCT model FROM book_chunks");
    expect(rows.map((r) => r.model)).toEqual(["fake-embedding-v2"]);
  });

  it("a failing embedder never fails a book save (syncBookSafely swallows and logs)", async () => {
    const logs: Record<string, unknown>[] = [];
    const broken: Embedder = { model: "x", dimensions: 768, queryPrefix: "", minSimilarity: 0.2, embed: async () => { throw new Error("down"); } };
    await expect(new BookIndexSync(store(), broken, (e) => logs.push(e)).syncBookSafely(ids.hawk!)).resolves.toBeUndefined();
    expect(logs[0]).toMatchObject({ event: "book_index_sync_failed", reason: "down" });
  });
});

describe("SLM-16 hybrid retrieval", () => {
  const hybrid = (embedder: Embedder | null, log?: RetrievalLog, timeoutMs?: number) =>
    new HybridCatalogRetrieval(lexical(), store(), embedder, log, timeoutMs);

  it("synonym-only query: «losing a parent» finds the grief memoirs by meaning, which full-text alone misses", async () => {
    await new BookIndexSync(store(), new FakeEmbedder()).syncAll();
    const fullText = await lexical().hits(SYNONYM_QUERY, { limit: 20, availableOnly: false });
    expect(fullText.map((c) => c.id)).not.toContain(ids.hawk);

    const r = hybrid(new FakeEmbedder());
    const c = await r.candidates(SYNONYM_QUERY, { limit: 20, availableOnly: false });
    const hawk = c.find((x) => x.id === ids.hawk);
    expect(hawk).toMatchObject({ foundBy: "semantic", related: false });
    expect(c.find((x) => x.id === ids.hmart)?.foundBy).toBe("semantic");
    expect(c.slice(0, 2).map((x) => x.id).sort()).toEqual([ids.hawk, ids.hmart].sort());
    expect(r.lastMode()).toBe("hybrid");
  });

  it("a book both retrievers find is marked «both» and ranks first", async () => {
    await new BookIndexSync(store(), new FakeEmbedder()).syncAll();
    const c = await hybrid(new FakeEmbedder()).candidates("a memoir about grief and mourning", { limit: 20, availableOnly: false });
    expect(c[0]!.foundBy).toBe("both");
    expect([ids.hawk, ids.hmart]).toContain(c[0]!.id);
  });

  it("availableOnly applies to the vector side too", async () => {
    await new BookIndexSync(store(), new FakeEmbedder()).syncAll();
    await pool.query("UPDATE books SET available_copies = 0 WHERE id = $1", [ids.hawk]);
    const c = await hybrid(new FakeEmbedder()).candidates(SYNONYM_QUERY, { limit: 20, availableOnly: true });
    expect(c.map((x) => x.id)).not.toContain(ids.hawk);
  });

  it("fallback: an embedder error leaves full-text only, and discovery still answers", async () => {
    await new BookIndexSync(store(), new FakeEmbedder()).syncAll();
    const logs: Parameters<RetrievalLog>[0][] = [];
    const broken: Embedder = { model: "fake-embedding-v1", dimensions: 768, queryPrefix: "", minSimilarity: 0.2, embed: async () => { throw new Error("AI down"); } };
    const r = hybrid(broken, (e) => logs.push(e));
    const c = await r.candidates("clean readable code", { limit: 20, availableOnly: false });
    expect(c[0]).toMatchObject({ id: ids.clean, foundBy: "lexical" });
    expect(r.lastMode()).toBe("lexical");
    expect(logs[0]).toMatchObject({ retrieval: "lexical", fallbackReason: "EMBEDDING_ERROR" });

    const res = await new BookDiscoveryService(r, null).discover({ query: "clean readable code" });
    expect(res.retrieval).toBe("lexical");
    expect(res.items[0]!.book.title).toBe("Clean Code");
  });

  it("fallback: a slow embedder times out to full-text only", async () => {
    const logs: Parameters<RetrievalLog>[0][] = [];
    const slow: Embedder = { model: "m", dimensions: 768, queryPrefix: "", minSimilarity: 0.2, embed: () => new Promise((resolve) => setTimeout(() => resolve([[1]]), 500)) };
    const r = hybrid(slow, (e) => logs.push(e), 30);
    const c = await r.candidates("clean readable code", { limit: 20, availableOnly: false });
    expect(c[0]!.id).toBe(ids.clean);
    expect(logs[0]).toMatchObject({ retrieval: "lexical", fallbackReason: "TIMEOUT" });
  });

  it("fallback: no embedder (no AI binding) is full-text only from the start", async () => {
    const logs: Parameters<RetrievalLog>[0][] = [];
    const r = hybrid(null, (e) => logs.push(e));
    await r.candidates("clean code", { limit: 20, availableOnly: false });
    expect(logs[0]).toMatchObject({ retrieval: "lexical", fallbackReason: "NO_EMBEDDER" });
  });

  it("an empty index (not backfilled yet) is hybrid with no vector hits: full-text results unchanged", async () => {
    const c = await hybrid(new FakeEmbedder()).candidates("clean readable code", { limit: 20, availableOnly: false });
    expect(c[0]).toMatchObject({ id: ids.clean, foundBy: "lexical" });
  });
});

describe("SLM-16 Workers AI embedder (binding contract)", () => {
  it("sends the texts in batches, normalises the vectors, rejects a wrong shape", async () => {
    const calls: unknown[] = [];
    const ai = { run: async (_m: string, input: Record<string, unknown>) => { calls.push(input); return { data: (input.text as string[]).map(() => Array.from({ length: 768 }, () => 2)) }; } };
    const e = new WorkersAiEmbedder(ai);
    const v = await e.embed(Array.from({ length: 60 }, (_, i) => `t${i}`));
    expect(calls).toHaveLength(2); // 50 + 10
    expect(v).toHaveLength(60);
    expect(cosine(v[0]!, v[0]!)).toBeCloseTo(1);
    expect(Math.hypot(...v[0]!)).toBeCloseTo(1);
    await expect(new WorkersAiEmbedder({ run: async () => ({ data: [[1, 2]] }) }).embed(["x"])).rejects.toThrow(/wrong size/);
  });
});

describe("SLM-16 API wiring", () => {
  const app = () => testApp({ env: { AI_FAKE: "true" } });
  const chunkCount = async (bookId: string) => Number((await pool.query("SELECT count(*) FROM book_chunks WHERE book_id = $1", [bookId])).rows[0].count);

  it("creating and editing a book indexes it in the same request", async () => {
    const a = app();
    const res = await a.request("/api/books", await as(staff.librarian, { method: "POST", body: { title: "A Grief Observed", author: "C. S. Lewis", category: "Memoir", totalCopies: 1, description: "Notes on mourning." } }));
    expect(res.status).toBe(201);
    const book = (await res.json()) as { id: string; version: number };
    expect(await chunkCount(book.id)).toBe(1);

    const put = await a.request(`/api/books/${book.id}`, await as(staff.librarian, { method: "PUT", body: { version: book.version, title: "A Grief Observed", author: "C. S. Lewis", category: "Memoir", totalCopies: 1, description: "Short notes written after his wife died." } }));
    expect(put.status).toBe(200);
    const { rows } = await pool.query("SELECT content FROM book_chunks WHERE book_id = $1", [book.id]);
    expect(rows[0].content).toContain("after his wife died");
  });

  it("admin reindex backfills the catalogue and reports counts; discovery then answers in hybrid mode", async () => {
    const a = app();
    const res = await a.request("/api/admin/discovery/reindex", await as(staff.admin, { method: "POST", body: {} }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ result: "done", embeddedBooks: 4, chunks: 4 });

    const ask = await a.request("/api/ai/book-discovery", await as(staff.librarian, { method: "POST", body: { query: SYNONYM_QUERY } }));
    const json = (await ask.json()) as DiscoveryResponse;
    expect(json.retrieval).toBe("hybrid");
    const hawk = json.items.find((i) => i.book.id === ids.hawk);
    expect(hawk?.foundBy).toBe("semantic");
  });

  it("without an embedder the reindex endpoint says so and changes nothing", async () => {
    const res = await testApp().request("/api/admin/discovery/reindex", await as(staff.admin, { method: "POST", body: {} }));
    expect(await res.json()).toMatchObject({ result: "disabled" });
  });
});
