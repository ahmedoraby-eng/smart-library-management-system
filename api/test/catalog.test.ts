import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { as, pool, resetDb, seedStaff, testApp } from "./support";

afterAll(() => pool.end());
let staff: Awaited<ReturnType<typeof seedStaff>>;
beforeEach(async () => { await resetDb(); staff = await seedStaff(); });

const valid = { title: "Clean Architecture", author: "Robert C. Martin", category: "Software Architecture", totalCopies: 3 };
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- test convenience

async function create(app = testApp(), body: Json = valid) {
  const res = await app.request("/api/books", await as(staff.librarian, { method: "POST", body }));
  return { res, json: (await res.json()) as Json };
}

/** Opens `open` loans and `returned` past loans on a book (raw SQL: circulation lands in SLM-4). */
async function loans(bookId: string, open: number, returned = 0) {
  for (let i = 0; i < open + returned; i++) {
    const m = (await pool.query("INSERT INTO members (full_name, email) VALUES ('M', $1) RETURNING id", [`m${Math.random()}@x.io`])).rows[0].id;
    const isReturned = i >= open;
    await pool.query(
      `INSERT INTO loans (book_id, member_id, processed_by, returned_by, borrowed_at, due_at, returned_at)
       VALUES ($1, $2, $3, $4, now() - interval '5 days', now() + interval '${7 + i} days', $5)`,
      [bookId, m, staff.librarian, isReturned ? staff.librarian : null, isReturned ? new Date() : null],
    );
  }
  if (open) await pool.query("UPDATE books SET available_copies = available_copies - $2 WHERE id = $1", [bookId, open]);
}

describe("SLM-1 book catalog management", () => {
  it("SLM-1 AC1 create → 201, available = total, timestamps, Location", async () => {
    const { res, json } = await create();
    expect(res.status).toBe(201);
    expect(res.headers.get("location")).toBe(`/api/books/${json.id}`);
    expect(json).toMatchObject({ title: "Clean Architecture", totalCopies: 3, availableCopies: 3, activeLoans: 0, hasLoanHistory: false, archived: false, version: 0, isbn: null, nextDueAt: null });
    expect(Date.parse(json.createdAt)).not.toBeNaN();
    expect(json.updatedAt).toBe(json.createdAt);
  });

  it("SLM-1 AC2 invalid fields → 400 VALIDATION_FAILED, one message per field, nothing saved", async () => {
    const { res, json } = await create(testApp(), { title: " ", author: "", category: "C", totalCopies: 0, publicationYear: 99999, isbn: "978-0-13-235088-5" });
    expect(res.status).toBe(400);
    expect(json.code).toBe("VALIDATION_FAILED");
    const fields = Object.fromEntries((json.errors as { field: string; message: string }[]).map((e) => [e.field, e.message]));
    expect(fields).toMatchObject({
      title: "Enter a title.", author: "Enter an author.", totalCopies: "Enter at least 1 copy.", isbn: "Enter a valid ISBN-10 or ISBN-13.",
    });
    expect(fields.publicationYear).toMatch(/^Enter a year between 1450 and \d{4}\.$/);
    expect((await pool.query("SELECT count(*)::int n FROM books")).rows[0].n).toBe(0);
  });

  it("SLM-1 AC2 ISBN hyphens accepted and normalised (valid check digit)", async () => {
    const { res, json } = await create(testApp(), { ...valid, isbn: "978-0-13-235088-4" });
    expect(res.status).toBe(201);
    expect(json.isbn).toBe("9780132350884");
  });

  it("SLM-1 AC3 duplicate ISBN of an active book → 409 DUPLICATE_ISBN with the other book", async () => {
    const app = testApp();
    const first = (await create(app, { ...valid, isbn: "9780132350884" })).json;
    const { res, json } = await create(app, { ...valid, title: "Other", isbn: "978-0132350884" });
    expect(res.status).toBe(409);
    expect(json).toMatchObject({ code: "DUPLICATE_ISBN", context: { bookId: first.id, title: "Clean Architecture" } });
  });

  it("SLM-1 AC3 an archived book's ISBN can be reused", async () => {
    const app = testApp();
    const first = (await create(app, { ...valid, isbn: "9780132350884" })).json;
    await loans(first.id, 0, 1);
    await app.request(`/api/books/${first.id}`, await as(staff.admin, { method: "DELETE" }));
    expect((await create(app, { ...valid, isbn: "9780132350884" })).res.status).toBe(201);
  });

  it("SLM-1 AC4 total can't drop below copies on loan; equal is fine and leaves 0 available", async () => {
    const app = testApp();
    const book = (await create(app, { ...valid, totalCopies: 5 })).json;
    await loans(book.id, 3);
    const put = async (totalCopies: number, version: number) =>
      app.request(`/api/books/${book.id}`, await as(staff.librarian, { method: "PUT", body: { ...valid, totalCopies, version } }));
    const below = await put(2, 0);
    expect(below.status).toBe(409);
    expect(await below.json()).toMatchObject({ code: "TOTAL_BELOW_LOANED", context: { onLoan: 3 } });
    const ok = await put(3, 0);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ totalCopies: 3, availableCopies: 0, activeLoans: 3, version: 1 });
    const up = await put(10, 1);
    expect(await up.json()).toMatchObject({ totalCopies: 10, availableCopies: 7 });
  });

  it("SLM-1 AC5 outdated version → 409 STALE_VERSION; nothing changes", async () => {
    const app = testApp();
    const book = (await create(app)).json;
    const edit = async (title: string) =>
      app.request(`/api/books/${book.id}`, await as(staff.librarian, { method: "PUT", body: { ...valid, title, version: 0 } }));
    expect((await edit("First edit")).status).toBe(200);
    const second = await edit("Second edit");
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({ code: "STALE_VERSION" });
    expect((await pool.query("SELECT title FROM books WHERE id = $1", [book.id])).rows[0].title).toBe("First edit");
  });

  it("SLM-1 AC6 delete with an open loan → 409 BOOK_HAS_ACTIVE_LOANS, book kept", async () => {
    const app = testApp();
    const book = (await create(app)).json;
    await loans(book.id, 1);
    const res = await app.request(`/api/books/${book.id}`, await as(staff.admin, { method: "DELETE" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "BOOK_HAS_ACTIVE_LOANS", context: { activeLoans: 1 } });
    expect((await pool.query("SELECT archived_at FROM books WHERE id = $1", [book.id])).rows[0].archived_at).toBeNull();
  });

  it("SLM-1 AC7 past loans only → archived: gone from the list, detail still readable; never borrowed → deleted", async () => {
    const app = testApp();
    const old = (await create(app, { ...valid, title: "Borrowed before" })).json;
    const fresh = (await create(app, { ...valid, title: "Never borrowed" })).json;
    await loans(old.id, 0, 2);
    const a = await app.request(`/api/books/${old.id}`, await as(staff.admin, { method: "DELETE" }));
    expect(await a.json()).toEqual({ result: "archived" });
    const d = await app.request(`/api/books/${fresh.id}`, await as(staff.admin, { method: "DELETE" }));
    expect(await d.json()).toEqual({ result: "deleted" });

    const list = (await (await app.request("/api/books", await as(staff.librarian))).json()) as Json;
    expect(list.items.map((b: Json) => b.title)).not.toContain("Borrowed before");
    const detail = (await (await app.request(`/api/books/${old.id}`, await as(staff.librarian))).json()) as Json;
    expect(detail).toMatchObject({ archived: true, hasLoanHistory: true });
    expect((await pool.query("SELECT count(*)::int n FROM loans WHERE book_id = $1", [old.id])).rows[0].n).toBe(2);
    expect((await app.request(`/api/books/${fresh.id}`, await as(staff.librarian))).status).toBe(404);
    // archived books can't be edited or deleted again
    expect((await app.request(`/api/books/${old.id}`, await as(staff.admin, { method: "DELETE" }))).status).toBe(404);
    expect((await app.request(`/api/books/${old.id}`, await as(staff.librarian, { method: "PUT", body: { ...valid, version: 1 } }))).status).toBe(404);
  });

  it("SLM-1 AC8 unknown or malformed id → 404 NOT_FOUND on GET/PUT/DELETE", async () => {
    const app = testApp();
    for (const id of ["00000000-0000-0000-0000-000000000000", "not-a-uuid"]) {
      expect((await app.request(`/api/books/${id}`, await as(staff.admin))).status).toBe(404);
      expect((await app.request(`/api/books/${id}`, await as(staff.admin, { method: "PUT", body: { ...valid, version: 0 } }))).status).toBe(404);
      const del = await app.request(`/api/books/${id}`, await as(staff.admin, { method: "DELETE" }));
      expect(del.status).toBe(404);
      expect(await del.json()).toMatchObject({ code: "NOT_FOUND" });
    }
  });

  it("derived fields: activeLoans and nextDueAt (earliest open due date) come from loans", async () => {
    const app = testApp();
    const book = (await create(app, { ...valid, totalCopies: 4 })).json;
    await loans(book.id, 2, 1);
    const b = (await (await app.request(`/api/books/${book.id}`, await as(staff.supervisor))).json()) as Json;
    expect(b).toMatchObject({ activeLoans: 2, availableCopies: 2, hasLoanHistory: true });
    const due = (await pool.query("SELECT min(due_at) d FROM loans WHERE book_id = $1 AND returned_at IS NULL", [book.id])).rows[0].d as Date;
    expect(b.nextDueAt).toBe(due.toISOString());
  });
});

describe("SLM-1 permissions (rbac-matrix)", () => {
  it("Supervisor reads but can't create, edit or delete; Librarian can't delete; DB unchanged", async () => {
    const app = testApp();
    const book = (await create(app)).json;
    expect((await app.request(`/api/books/${book.id}`, await as(staff.supervisor))).status).toBe(200);
    expect((await app.request("/api/books", await as(staff.supervisor, { method: "POST", body: valid }))).status).toBe(403);
    expect((await app.request(`/api/books/${book.id}`, await as(staff.supervisor, { method: "PUT", body: { ...valid, title: "X", version: 0 } }))).status).toBe(403);
    expect((await app.request(`/api/books/${book.id}`, await as(staff.supervisor, { method: "DELETE" }))).status).toBe(403);
    expect((await app.request(`/api/books/${book.id}`, await as(staff.librarian, { method: "DELETE" }))).status).toBe(403);
    const row = (await pool.query("SELECT count(*)::int n, min(title) t FROM books")).rows[0];
    expect(row).toEqual({ n: 1, t: "Clean Architecture" });
  });

  it("no session → 401 on every book route", async () => {
    const app = testApp();
    for (const [method, path] of [["GET", "/api/books"], ["GET", "/api/books/categories"], ["POST", "/api/books"], ["DELETE", "/api/books/x"]] as const) {
      const res = await app.request(path, { method, headers: { origin: "http://localhost" } });
      expect(res.status).toBe(401);
    }
  });
});

describe("book list (basis for SLM-2)", () => {
  beforeEach(async () => {
    const app = testApp();
    for (const [title, author, category, totalCopies] of [
      ["Clean Code", "Robert C. Martin", "Programming", 2],
      ["Clean Architecture", "Robert C. Martin", "Software Architecture", 1],
      ["Domain-Driven Design", "Eric Evans", "Software Architecture", 1],
      ["The Hobbit", "J.R.R. Tolkien", "Fiction", 3],
    ] as const) await create(app, { title, author, category, totalCopies });
  });
  const list = async (qs: string) => (await (await testApp().request(`/api/books${qs}`, await as(staff.librarian))).json()) as Json;

  it("pages with total and sorts by title by default", async () => {
    const p = await list("?size=2&page=2");
    expect(p).toMatchObject({ total: 4, page: 2, size: 2 });
    expect(p.items.map((b: Json) => b.title)).toEqual(["Domain-Driven Design", "The Hobbit"]);
  });

  it("filters by category and availability; sorts by a whitelisted key; rejects unknown keys", async () => {
    const id = (await list("?q=hobbit")).items[0].id;
    await loans(id, 3);
    expect((await list("?category=Software%20Architecture")).total).toBe(2);
    expect((await list("?availability=unavailable")).items.map((b: Json) => b.title)).toEqual(["The Hobbit"]);
    expect((await list("?sort=-title")).items[0].title).toBe("The Hobbit");
    const bad = await testApp().request("/api/books?sort=password", await as(staff.librarian));
    expect(bad.status).toBe(400);
  });

  it("searches title/author by prefix and tolerates a typo", async () => {
    expect((await list("?q=clea")).items.map((b: Json) => b.title).sort()).toEqual(["Clean Architecture", "Clean Code"]);
    expect((await list("?q=evans")).items[0].title).toBe("Domain-Driven Design");
    expect((await list("?q=Tolkein")).items[0].title).toBe("The Hobbit");
    expect((await list("?q=zzzz")).total).toBe(0);
  });

  it("categories lists distinct active categories", async () => {
    const res = await testApp().request("/api/books/categories", await as(staff.supervisor));
    expect(await res.json()).toEqual({ items: ["Fiction", "Programming", "Software Architecture"] });
  });
});
