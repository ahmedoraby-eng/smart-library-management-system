import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { SimilarBooksResponseSchema, type SimilarBooksResponse } from "@slm/contracts";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BookIndexSync } from "../src/discovery/application/BookIndexSync";
import { SIMILAR_BOOKS_LIMIT, SimilarBooks } from "../src/discovery/application/SimilarBooks";
import type { DiscoveryBook } from "../src/discovery/domain/Discovery";
import { meanVector } from "../src/discovery/domain/Fusion";
import type { ChunkStore, VectorHit } from "../src/discovery/domain/Indexing";
import { FakeAiProvider } from "../src/discovery/infrastructure/FakeAiProvider";
import { FakeEmbedder } from "../src/discovery/infrastructure/FakeEmbedder";
import { PgChunkStore } from "../src/discovery/infrastructure/PgChunkStore";
import { createDb } from "../src/platform/db";
import { as, pool, resetDb, seedStaff, testApp } from "./support";

/**
 * SLM-19 "More like this": GET /api/books/:id/similar. Runs the real vector path of this database: HNSW with
 * pgvector (CI's pgvector image), the brute-force scan without it (the embedded Postgres used locally).
 */
afterAll(() => pool.end());
afterEach(() => vi.restoreAllMocks());

const ids: Record<string, string> = {};
let staff: Awaited<ReturnType<typeof seedStaff>>;
const fakeAi = { AI_FAKE: "true" };
const index = () => new BookIndexSync(new PgChunkStore(createDb(pool)), new FakeEmbedder()).syncAll(10_000);

async function addBook(key: string, title: string, category: string, description: string, available = 2) {
  const r = await pool.query(
    `INSERT INTO books (title, author, category, description, total_copies, available_copies) VALUES ($1,'An Author',$2,$3,2,$4) RETURNING id`,
    [title, category, description, available],
  );
  ids[key] = r.rows[0].id;
}

async function similar(bookId: string, who = staff.librarian, env: Record<string, string> = fakeAi) {
  return testApp({ env }).request(`/api/books/${bookId}/similar`, await as(who));
}
const titlesOf = (body: SimilarBooksResponse) => body.items.map((i) => i.book.title);

beforeEach(async () => {
  await resetDb();
  staff = await seedStaff();
  await addBook(
    "hawk",
    "H Is for Hawk",
    "Memoir",
    "After her father's sudden death, a naturalist trains a goshawk and works through her grief.",
  );
  await addBook(
    "hmart",
    "Crying in H Mart",
    "Memoir",
    "A musician remembers her mother through food, illness, death and mourning.",
    0,
  );
  await addBook("grief", "A Grief Observed", "Memoir", "Notes on grief and bereavement after the death of a wife.");
  await addBook("clean", "Clean Code", "Programming", "Readable code, naming and small functions.");
  await addBook("cosmos", "Cosmos", "Science", "A tour of the universe, the stars and the galaxies.");
  await addBook("calm", "Calm Mind", "Wellbeing", "Mindfulness and calm for anxious days.");
});

describe("SLM-19 GET /api/books/:id/similar", () => {
  it("lists the closest other books best first, at most 4, with fresh availability; never the book itself", async () => {
    await index();
    const res = await similar(ids.hawk!);
    expect(res.status).toBe(200);
    const body = SimilarBooksResponseSchema.parse(await res.json());
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.length).toBeLessThanOrEqual(SIMILAR_BOOKS_LIMIT);
    // The two grief memoirs share the most meaning with H Is for Hawk (death, grief, mourning, parent).
    expect(titlesOf(body).slice(0, 2).sort()).toEqual(["A Grief Observed", "Crying in H Mart"]);
    expect(body.items.map((i) => i.book.id)).not.toContain(ids.hawk);
    const sims = body.items.map((i) => i.similarity);
    expect(sims).toEqual([...sims].sort((a, b) => b - a));
    expect(sims.every((s) => s > 0 && s <= 1)).toBe(true);
    // Availability is read from the catalogue, not from the index.
    const hmart = body.items.find((i) => i.book.id === ids.hmart)!;
    expect(hmart.book).toMatchObject({ title: "Crying in H Mart", availableCopies: 0, totalCopies: 2 });
  });

  it("archived books are never suggested, even when their chunks are still in the index", async () => {
    await index();
    // Archived after indexing, as if the inline sync had failed: its chunks are still there.
    await pool.query("UPDATE books SET archived_at = now() WHERE id = $1", [ids.grief]);
    const body = (await (await similar(ids.hawk!)).json()) as SimilarBooksResponse;
    expect(titlesOf(body)).not.toContain("A Grief Observed");
    expect(titlesOf(body)[0]).toBe("Crying in H Mart");
  });

  it("a book that isn't indexed yet gets an empty list (200, the UI hides the section)", async () => {
    await index();
    await addBook("fresh", "Fresh Arrival", "Memoir", "Grief and the death of a father.");
    const res = await similar(ids.fresh!);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [] });
  });

  it("an archived book (its chunks removed by the sync) gets an empty list, not an error", async () => {
    await pool.query("UPDATE books SET archived_at = now() WHERE id = $1", [ids.hawk]);
    await index();
    const res = await similar(ids.hawk!);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [] });
  });

  it("with vector search off (no embedder) the list is empty", async () => {
    await index();
    const res = await similar(ids.hawk!, staff.librarian, {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [] });
  });

  it("makes no model call: nothing is embedded or ranked, and no AI usage is counted", async () => {
    await index();
    const embed = vi.spyOn(FakeEmbedder.prototype, "embed");
    const rank = vi.spyOn(FakeAiProvider.prototype, "rank");
    expect((await similar(ids.hawk!)).status).toBe(200);
    expect(embed).not.toHaveBeenCalled();
    expect(rank).not.toHaveBeenCalled();
    expect((await pool.query("SELECT 1 FROM ai_usage")).rowCount).toBe(0);
  });

  it("404 for an unknown or malformed book id, in the catalogue's problem format", async () => {
    await index();
    const missing = await similar("00000000-0000-4000-8000-000000000000");
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ code: "NOT_FOUND", detail: "This book was not found." });
    expect((await similar("not-a-uuid")).status).toBe(404);
  });

  it("every staff role may read it (BOOK_READ); no session → 401; a disabled account is refused", async () => {
    await index();
    for (const who of [staff.admin, staff.librarian, staff.supervisor])
      expect((await similar(ids.hawk!, who)).status).toBe(200);
    const anonymous = await testApp({ env: fakeAi }).request(`/api/books/${ids.hawk}/similar`);
    expect(anonymous.status).toBe(401);
    expect([401, 403]).toContain((await similar(ids.hawk!, staff.disabled)).status);
  });

  it("demo seed: H Is for Hawk's two closest are A Grief Observed and Crying in H Mart (the demo script)", async () => {
    await pool.query("DELETE FROM books");
    await pool.query(await readFile(fileURLToPath(new URL("../../seed/demo.sql", import.meta.url).href), "utf8"));
    await index();
    const { rows } = await pool.query("SELECT id FROM books WHERE title = 'H Is for Hawk'");
    const body = (await (await similar(rows[0].id)).json()) as SimilarBooksResponse;
    expect(body.items).toHaveLength(SIMILAR_BOOKS_LIMIT);
    expect(titlesOf(body).slice(0, 2).sort()).toEqual(["A Grief Observed", "Crying in H Mart"]);
  });
});

describe("SLM-19 SimilarBooks (application)", () => {
  const summary = (id: string): DiscoveryBook => ({
    id,
    title: `T-${id}`,
    author: "A",
    category: "C",
    publicationYear: null,
    coverImageUrl: null,
    availableCopies: 1,
    totalCopies: 1,
    nextDueAt: null,
  });
  const store = (hits: VectorHit[]) => {
    const similarTo = vi.fn(async () => hits);
    return { store: { similarTo } as unknown as ChunkStore, similarTo };
  };

  it("without an embedder the store isn't asked", async () => {
    const s = store([{ bookId: "b", similarity: 0.9 }]);
    expect(await new SimilarBooks(s.store, { summaries: async () => new Map() }, null).forBook("x")).toEqual({
      items: [],
    });
    expect(s.similarTo).not.toHaveBeenCalled();
  });

  it("no neighbours → no catalogue read", async () => {
    const summaries = vi.fn(async () => new Map<string, DiscoveryBook>());
    expect(await new SimilarBooks(store([]).store, { summaries }, { model: "m" }).forBook("x")).toEqual({
      items: [],
    });
    expect(summaries).not.toHaveBeenCalled();
  });

  it("keeps the store's order, rounds the similarity to 3 decimals, drops a book gone between the two reads, asks for 4 by default", async () => {
    const s = store([
      { bookId: "a", similarity: 0.98765 },
      { bookId: "gone", similarity: 0.9 },
      { bookId: "b", similarity: 0.5 },
    ]);
    const out = await new SimilarBooks(
      s.store,
      {
        summaries: async () =>
          new Map([
            ["b", summary("b")],
            ["a", summary("a")],
          ]),
      },
      { model: "m" },
    ).forBook("x");
    expect(out.items.map((i) => [i.book.id, i.similarity])).toEqual([
      ["a", 0.988],
      ["b", 0.5],
    ]);
    expect(s.similarTo).toHaveBeenCalledWith("x", { model: "m", limit: SIMILAR_BOOKS_LIMIT });
  });
});

describe("SLM-19 meanVector", () => {
  it("averages element-wise; empty input → empty vector; uneven lengths use the shortest", () => {
    expect(meanVector([])).toEqual([]);
    expect(
      meanVector([
        [1, 0, 2],
        [0, 1, 4],
      ]),
    ).toEqual([0.5, 0.5, 3]);
    expect(meanVector([[1, 2, 3], [3]])).toEqual([2]);
  });
});
