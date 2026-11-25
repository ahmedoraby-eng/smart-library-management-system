import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, pool, resetDb, seedStaff, testApp } from "./support";

/**
 * SLM-2 book search and browse (test-strategy §3.2 search row): title, author, ISBN exact, category,
 * publisher, description, case and partial words, filters combined with a query, stable sort across
 * pages, empty result, typo, SQL-special characters as plain text, and latency on the demo dataset.
 */
afterAll(() => pool.end());
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- test convenience
let staff: Awaited<ReturnType<typeof seedStaff>>;

const BOOKS = [
  {
    title: "Clean Code",
    author: "Robert C. Martin",
    category: "Programming",
    publisher: "Prentice Hall",
    isbn: "9780132350884",
    description: "A handbook of agile software craftsmanship.",
    publicationYear: 2008,
    totalCopies: 2,
  },
  {
    title: "Clean Architecture",
    author: "Robert C. Martin",
    category: "Software Architecture",
    publisher: "Prentice Hall",
    isbn: "9780134494166",
    description: "A craftsman's guide to software structure.",
    publicationYear: 2017,
    totalCopies: 1,
  },
  {
    title: "Domain-Driven Design",
    author: "Eric Evans",
    category: "Software Architecture",
    publisher: "Addison-Wesley",
    isbn: "9780321125217",
    description: "Tackling complexity in the heart of software.",
    publicationYear: 2003,
    totalCopies: 1,
  },
  {
    title: "The Hobbit",
    author: "J.R.R. Tolkien",
    category: "Fiction",
    publisher: "Allen & Unwin",
    isbn: "9780547928227",
    description: "A dragon, a wizard and a reluctant burglar.",
    publicationYear: 1937,
    totalCopies: 3,
  },
  {
    title: "Dune",
    author: "Frank Herbert",
    category: "Fiction",
    publisher: "Chilton Books",
    isbn: null,
    description: "Spice, sandworms and politics on Arrakis.",
    publicationYear: 1965,
    totalCopies: 1,
  },
];

beforeAll(async () => {
  await resetDb();
  staff = await seedStaff();
  const app = testApp();
  for (const b of BOOKS) {
    const res = await app.request("/api/books", await as(staff.librarian, { method: "POST", body: b }));
    expect(res.status).toBe(201);
  }
  // Dune is fully on loan (raw SQL: the circulation path is tested elsewhere).
  await pool.query("UPDATE books SET available_copies = 0 WHERE title = 'Dune'");
});

const list = async (qs: string) => {
  const res = await testApp().request(`/api/books${qs}`, await as(staff.librarian));
  expect(res.status).toBe(200);
  return (await res.json()) as Json;
};
const titles = async (qs: string) => (await list(qs)).items.map((b: Json) => b.title as string).sort();

describe("SLM-2 AC1 free-text search over every metadata field", () => {
  it.each([
    ["title or category, partial word", "?q=archi", ["Clean Architecture", "Domain-Driven Design"]],
    ["title only words", "?q=hobbit", ["The Hobbit"]],
    ["author, any case", "?q=TOLKIEN", ["The Hobbit"]],
    ["ISBN exact, plain", "?q=9780321125217", ["Domain-Driven Design"]],
    ["ISBN exact, hyphenated", "?q=978-0-321-12521-7", ["Domain-Driven Design"]],
    ["category", "?q=fiction", ["Dune", "The Hobbit"]],
    ["publisher", "?q=wesley", ["Domain-Driven Design"]],
    ["description", "?q=sandworms", ["Dune"]],
    ["two words across fields", "?q=martin%20craftsmanship", ["Clean Code"]],
    ["typo (trigram)", "?q=Tolkein", ["The Hobbit"]],
  ])("%s", async (_name, qs, expected) => {
    expect(await titles(qs)).toEqual(expected);
  });

  it("SLM-2 AC5 no match → empty items and total 0", async () => {
    expect(await list("?q=zzzzqx")).toMatchObject({ items: [], total: 0 });
  });

  it.each(["'", "%", "_", ";--", "' OR 1=1 --", "\\", "Clean%' ; DROP TABLE books; --"])(
    "SQL-special input %j is plain text (no error, no leak)",
    async (q) => {
      const res = await testApp().request(`/api/books?q=${encodeURIComponent(q)}`, await as(staff.librarian));
      expect(res.status).toBe(200);
      const json = (await res.json()) as Json;
      expect(json.total).toBeLessThan(BOOKS.length);
      expect((await pool.query("SELECT count(*)::int n FROM books")).rows[0].n).toBe(BOOKS.length);
    },
  );
});

describe("SLM-2 AC2 filters combine with the query", () => {
  it("query + category", async () => {
    expect(await titles("?q=martin&category=Programming")).toEqual(["Clean Code"]);
  });
  it("query + available only excludes fully loaned books", async () => {
    expect(await titles("?q=fiction&availability=available")).toEqual(["The Hobbit"]);
    expect(await titles("?q=fiction&availability=unavailable")).toEqual(["Dune"]);
  });
  it("query + category + availability with no overlap → empty", async () => {
    expect((await list("?q=dune&category=Programming&availability=available")).total).toBe(0);
  });
});

describe("SLM-2 AC3/AC4 sort and paging", () => {
  it.each([
    ["title", ["Clean Architecture", "Clean Code", "Domain-Driven Design", "Dune", "The Hobbit"]],
    ["-title", ["The Hobbit", "Dune", "Domain-Driven Design", "Clean Code", "Clean Architecture"]],
    ["publicationYear", ["The Hobbit", "Dune", "Domain-Driven Design", "Clean Code", "Clean Architecture"]],
    ["-publicationYear", ["Clean Architecture", "Clean Code", "Domain-Driven Design", "Dune", "The Hobbit"]],
  ])("sort=%s", async (sort, expected) => {
    expect((await list(`?sort=${sort}&size=20`)).items.map((b: Json) => b.title)).toEqual(expected);
  });

  it("pages are stable and disjoint when the sort key ties (author: two books by Martin)", async () => {
    const pages = [];
    for (let page = 1; page <= 5; page++)
      pages.push(...(await list(`?sort=author&size=1&page=${page}`)).items.map((b: Json) => b.id));
    expect(new Set(pages).size).toBe(BOOKS.length);
    const again = [];
    for (let page = 1; page <= 5; page++)
      again.push(...(await list(`?sort=author&size=1&page=${page}`)).items.map((b: Json) => b.id));
    expect(again).toEqual(pages);
  });

  it("total counts all matches while items hold one page", async () => {
    expect(await list("?q=software&size=2&page=1")).toMatchObject({ total: 3, page: 1, size: 2 });
    expect((await list("?q=software&size=2&page=2")).items).toHaveLength(1);
  });

  it("size above 100 and unknown sort keys are refused", async () => {
    expect((await testApp().request("/api/books?size=101", await as(staff.librarian))).status).toBe(400);
    expect((await testApp().request("/api/books?sort=isbn", await as(staff.librarian))).status).toBe(400);
  });
});

describe("SLM-2 search latency on the demo dataset (D13)", () => {
  it("each search answers under 500 ms (soft assert at 1 s for shared CI runners)", async () => {
    const app = testApp();
    const reset = await app.request("/api/admin/reset-demo", await as(staff.admin, { method: "POST", body: {} }));
    expect(reset.status).toBe(200);
    const queries = [
      "?q=clean",
      "?q=tolkein",
      "?q=history",
      "?q=978",
      "?q=software&availability=available",
      "?sort=-createdAt",
      "?category=Fiction&sort=author",
    ];
    const cookie = await as(staff.librarian);
    await app.request(`/api/books${queries[0]}`, cookie); // warm-up: first query plans and connects
    const times: Record<string, number> = {};
    for (const qs of queries) {
      const t = performance.now();
      const res = await app.request(`/api/books${qs}`, cookie);
      times[qs] = Math.round(performance.now() - t);
      expect(res.status).toBe(200);
    }
    console.info(`search latency ms (demo dataset): ${JSON.stringify(times)}`);
    const worst = Math.max(...Object.values(times));
    expect(worst).toBeLessThan(1000);
  });
});
