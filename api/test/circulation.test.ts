import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { as, pool, resetDb, seedStaff, testApp } from "./support";

afterAll(() => pool.end());
let staff: Awaited<ReturnType<typeof seedStaff>>;
beforeEach(async () => { await resetDb(); staff = await seedStaff(); });

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- test convenience
const DAY = 86_400_000;

// ---------- fixtures (raw SQL: the members API is another module) ----------
async function book(totalCopies = 3, title = `Book ${Math.random().toString(36).slice(2, 8)}`): Promise<string> {
  const r = await pool.query(
    "INSERT INTO books (title, author, category, total_copies, available_copies) VALUES ($1, 'Author', 'Cat', $2, $2) RETURNING id",
    [title, totalCopies],
  );
  return r.rows[0].id;
}
async function member(status: "ACTIVE" | "INACTIVE" = "ACTIVE", fullName = "Sara Haddad"): Promise<string> {
  const r = await pool.query("INSERT INTO members (full_name, email, status) VALUES ($1, $2, $3) RETURNING id", [
    fullName, `m-${crypto.randomUUID()}@example.org`, status,
  ]);
  return r.rows[0].id;
}
async function stock(bookId: string): Promise<{ total: number; available: number; open: number }> {
  const r = await pool.query(
    `SELECT total_copies AS total, available_copies AS available,
            (SELECT count(*)::int FROM loans WHERE book_id = $1 AND returned_at IS NULL) AS open
       FROM books WHERE id = $1`,
    [bookId],
  );
  return r.rows[0];
}
const loanCount = async () => (await pool.query("SELECT count(*)::int n FROM loans")).rows[0].n as number;

async function borrow(app: ReturnType<typeof testApp>, bookId: string, memberId: string, extra: Json = {}, by = staff.librarian) {
  const res = await app.request("/api/loans/borrow", await as(by, { method: "POST", body: { bookId, memberId, ...extra } }));
  return { res, json: (await res.json()) as Json };
}
async function giveBack(app: ReturnType<typeof testApp>, loanId: string, by = staff.librarian) {
  const res = await app.request(`/api/loans/${loanId}/return`, await as(by, { method: "POST" }));
  return { res, json: (await res.json()) as Json };
}

/** inventory-invariant (test-strategy §3.1): for every book, 0 ≤ available ≤ total and available = total − open loans. */
async function expectInventoryInvariant() {
  const { rows } = await pool.query(`
    SELECT b.id, b.total_copies, b.available_copies,
           (SELECT count(*)::int FROM loans l WHERE l.book_id = b.id AND l.returned_at IS NULL) AS open
      FROM books b`);
  for (const b of rows) {
    expect(b.available_copies).toBeGreaterThanOrEqual(0);
    expect(b.available_copies).toBeLessThanOrEqual(b.total_copies);
    expect(b.available_copies).toBe(b.total_copies - b.open);
  }
}
// Every test in this file ends with the invariant holding.
afterEach(async () => { await expectInventoryInvariant(); });

describe("SLM-4 borrow", () => {
  it("SLM-4 AC1 happy borrow → 201 ACTIVE loan, processedBy = the staff user, stock −1 in the same transaction", async () => {
    const app = testApp();
    const [b, m] = [await book(3, "Clean Code"), await member()];
    const { res, json } = await borrow(app, b, m);
    expect(res.status).toBe(201);
    expect(res.headers.get("location")).toBe(`/api/loans/${json.id}`);
    expect(json).toMatchObject({
      status: "ACTIVE", returnedAt: null, returnedBy: null,
      book: { id: b, title: "Clean Code", author: "Author" },
      member: { id: m, fullName: "Sara Haddad" },
      processedBy: { id: staff.librarian, name: "Layla Librarian" },
    });
    expect(json.member.memberNumber).toMatch(/^M-\d{6}$/);
    expect(await stock(b)).toMatchObject({ total: 3, available: 2, open: 1 });
    const row = (await pool.query("SELECT processed_by FROM loans WHERE id = $1", [json.id])).rows[0];
    expect(row.processed_by).toBe(staff.librarian);
  });

  it("SLM-4 AC1 a failure after the stock change rolls the stock back (one transaction)", async () => {
    // A temporary constraint makes the loan INSERT fail after takeCopy ran: nothing may stay changed.
    const now = new Date();
    const app = testApp({ clock: () => now });
    const [b, m] = [await book(2), await member()];
    await pool.query("ALTER TABLE loans ADD CONSTRAINT test_reject_all CHECK (false) NOT VALID");
    try {
      const { res } = await borrow(app, b, m);
      expect(res.status).toBe(500);
    } finally {
      await pool.query("ALTER TABLE loans DROP CONSTRAINT test_reject_all");
    }
    expect(await stock(b)).toMatchObject({ available: 2, open: 0 });
    expect(await loanCount()).toBe(0);
  });

  it("SLM-4 AC2 due date defaults to now + 14 days (injected clock)", async () => {
    const now = new Date("2026-11-24T09:30:00.000Z");
    const app = testApp({ clock: () => now });
    const { res, json } = await borrow(app, await book(), await member());
    expect(res.status).toBe(201);
    expect(json.borrowedAt).toBe(now.toISOString());
    expect(json.dueAt).toBe(new Date(now.getTime() + 14 * DAY).toISOString());
  });

  it("SLM-4 AC2 LOAN_DAYS config changes the default", async () => {
    const now = new Date();
    const app = testApp({ clock: () => now, env: { LOAN_DAYS: "7" } });
    const { json } = await borrow(app, await book(), await member());
    expect(json.dueAt).toBe(new Date(now.getTime() + 7 * DAY).toISOString());
  });

  it("SLM-4 AC2 custom due date: 1 and 60 days accepted; 0 and 61 → 400 with the ux wording, nothing changed", async () => {
    const now = new Date();
    const app = testApp({ clock: () => now });
    const at = (days: number) => new Date(now.getTime() + days * DAY).toISOString();
    const b = await book(5);
    for (const days of [1, 60]) {
      const { res, json } = await borrow(app, b, await member(), { dueAt: at(days) });
      expect(res.status, `${days} days`).toBe(201);
      expect(json.dueAt).toBe(at(days));
    }
    for (const days of [0, 61, -3]) {
      const { res, json } = await borrow(app, b, await member(), { dueAt: at(days) });
      expect(res.status, `${days} days`).toBe(400);
      expect(json.code).toBe("VALIDATION_FAILED");
      expect(json.errors[0].field).toBe("dueAt");
      expect(json.errors[0].message).toMatch(/^Choose a due date between tomorrow and \d{1,2} \w{3} \d{4}\.$/);
    }
    expect(await stock(b)).toMatchObject({ available: 3, open: 2 });
  });

  it("SLM-4 AC2 malformed body → 400 VALIDATION_FAILED", async () => {
    const app = testApp();
    const { res, json } = await borrow(app, "not-a-uuid", "also-not", { dueAt: "tomorrow" });
    expect(res.status).toBe(400);
    expect(json.errors.map((e: Json) => e.field).sort()).toEqual(["bookId", "dueAt", "memberId"]);
  });

  it("SLM-4 AC3 BOOK_UNAVAILABLE at 0 copies: 409 with the next due date, no loan, stock unchanged", async () => {
    const app = testApp();
    const b = await book(1, "Last Copy");
    expect((await borrow(app, b, await member())).res.status).toBe(201);
    const before = await loanCount();
    const { res, json } = await borrow(app, b, await member());
    expect(res.status).toBe(409);
    expect(json).toMatchObject({ code: "BOOK_UNAVAILABLE", detail: "No copies of 'Last Copy' are available." });
    expect(Date.parse(json.context.nextDueAt)).not.toBeNaN();
    expect(await loanCount()).toBe(before);
    expect(await stock(b)).toMatchObject({ available: 0, open: 1 });
  });

  it("SLM-4 AC4 MEMBER_INACTIVE: 409, no loan, stock unchanged", async () => {
    const app = testApp();
    const b = await book(2);
    const { res, json } = await borrow(app, b, await member("INACTIVE", "Omar Nasser"));
    expect(res.status).toBe(409);
    expect(json).toMatchObject({ code: "MEMBER_INACTIVE", detail: "Omar Nasser is inactive. Reactivate them on the member page first." });
    expect(await loanCount()).toBe(0);
    expect(await stock(b)).toMatchObject({ available: 2 });
  });

  it("SLM-4 AC4 LOAN_LIMIT_REACHED: 5 open loans OK, the 6th → 409 and nothing changes; returning one re-allows", async () => {
    const app = testApp();
    const m = await member();
    const loanIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const { res, json } = await borrow(app, await book(1), m);
      expect(res.status).toBe(201);
      loanIds.push(json.id);
    }
    const sixth = await book(1);
    const { res, json } = await borrow(app, sixth, m);
    expect(res.status).toBe(409);
    expect(json).toMatchObject({ code: "LOAN_LIMIT_REACHED", context: { activeLoans: 5, limit: 5 } });
    expect(await stock(sixth)).toMatchObject({ available: 1, open: 0 });
    expect(await loanCount()).toBe(5);

    expect((await giveBack(app, loanIds[0]!)).res.status).toBe(200);
    expect((await borrow(app, sixth, m)).res.status).toBe(201);
  });

  it("SLM-4 AC4 ALREADY_BORROWED: same member, same title → 409 with the open loan, nothing changes", async () => {
    const app = testApp();
    const [b, m] = [await book(3, "Refactoring"), await member()];
    const first = await borrow(app, b, m);
    const { res, json } = await borrow(app, b, m);
    expect(res.status).toBe(409);
    expect(json.code).toBe("ALREADY_BORROWED");
    expect(json.detail).toMatch(/^Sara Haddad already has 'Refactoring' on loan \(due \d{1,2} \w{3} \d{4}\)\.$/);
    expect(json.context.loanId).toBe(first.json.id);
    expect(await stock(b)).toMatchObject({ available: 2, open: 1 });
  });

  it("SLM-4 AC4 unknown member / unknown or archived book → 404, nothing changes", async () => {
    const app = testApp();
    const [b, m] = [await book(2), await member()];
    expect((await borrow(app, b, crypto.randomUUID())).json.code).toBe("NOT_FOUND");
    expect((await borrow(app, crypto.randomUUID(), m)).json.code).toBe("NOT_FOUND");
    await pool.query("UPDATE books SET archived_at = now() WHERE id = $1", [b]);
    const { res } = await borrow(app, b, m);
    expect(res.status).toBe(404);
    expect(await stock(b)).toMatchObject({ available: 2 });
    expect(await loanCount()).toBe(0);
  });

  it("SLM-4 the DB backstop: a unique violation on the open-loan index maps to 409 ALREADY_BORROWED", async () => {
    // The application pre-checks (under the member lock) answer first, so the backstops can't be reached
    // through the API; prove the SQLSTATE mapping on the real constraints instead.
    const { circulationErrorFrom } = await import("../src/circulation/infrastructure/pgErrors");
    const [b, m] = [await book(2), await member()];
    const insert = () => pool.query(
      "INSERT INTO loans (book_id, member_id, processed_by, due_at) VALUES ($1, $2, $3, now() + interval '1 day')",
      [b, m, staff.librarian],
    );
    await insert();
    const err = await insert().catch((e) => e);
    expect(circulationErrorFrom(err)).toMatchObject({ status: 409, code: "ALREADY_BORROWED" });
    await pool.query("UPDATE books SET available_copies = available_copies - 1 WHERE id = $1", [b]); // the one inserted loan
    const check = await pool.query("UPDATE books SET available_copies = -1 WHERE id = $1", [b]).catch((e) => e);
    expect(circulationErrorFrom(check)).toMatchObject({ status: 409, code: "BOOK_UNAVAILABLE" });
  });
});

describe("SLM-4 return", () => {
  it("SLM-4 AC5 return → 200 RETURNED, returnedAt set, returnedBy = the returning staff user, stock +1", async () => {
    const app = testApp();
    const b = await book(2, "Clean Code");
    const loan = (await borrow(app, b, await member())).json;
    const { res, json } = await giveBack(app, loan.id, staff.admin);
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ id: loan.id, status: "RETURNED", returnedBy: { id: staff.admin, name: "Amira Admin" }, processedBy: { id: staff.librarian } });
    expect(Date.parse(json.returnedAt)).not.toBeNaN();
    expect(await stock(b)).toMatchObject({ available: 2, open: 0 });
  });

  it("SLM-4 AC6 duplicate return → 409 LOAN_ALREADY_RETURNED, stock and returnedAt unchanged", async () => {
    const app = testApp();
    const b = await book(2);
    const loan = (await borrow(app, b, await member())).json;
    const first = (await giveBack(app, loan.id)).json;
    const { res, json } = await giveBack(app, loan.id, staff.admin);
    expect(res.status).toBe(409);
    expect(json).toMatchObject({ code: "LOAN_ALREADY_RETURNED", context: { returnedAt: first.returnedAt, returnedBy: "Layla Librarian" } });
    expect(await stock(b)).toMatchObject({ available: 2, open: 0 });
    const row = (await pool.query("SELECT returned_at, returned_by FROM loans WHERE id = $1", [loan.id])).rows[0];
    expect(row.returned_at.toISOString()).toBe(first.returnedAt);
    expect(row.returned_by).toBe(staff.librarian);
  });

  it("SLM-4 AC6 unknown loan id → 404; malformed id → 400", async () => {
    const app = testApp();
    const unknown = await giveBack(app, crypto.randomUUID());
    expect(unknown.res.status).toBe(404);
    expect(unknown.json.code).toBe("NOT_FOUND");
    const bad = await giveBack(app, "123");
    expect(bad.res.status).toBe(400);
    expect(bad.json.code).toBe("VALIDATION_FAILED");
  });

  it("SLM-4 D4 an inactive member can return", async () => {
    const app = testApp();
    const [b, m] = [await book(1), await member()];
    const loan = (await borrow(app, b, m)).json;
    await pool.query("UPDATE members SET status = 'INACTIVE' WHERE id = $1", [m]);
    expect((await giveBack(app, loan.id)).res.status).toBe(200);
    expect(await stock(b)).toMatchObject({ available: 1, open: 0 });
  });

  it("SLM-4 D4 a return on an archived book still increments its stock", async () => {
    const app = testApp();
    const b = await book(2);
    const loan = (await borrow(app, b, await member())).json;
    await pool.query("UPDATE books SET archived_at = now() WHERE id = $1", [b]); // not reachable through the API (open loans block archive)
    expect((await giveBack(app, loan.id)).res.status).toBe(200);
    expect(await stock(b)).toMatchObject({ available: 2, open: 0 });
  });
});

describe("SLM-4 concurrency (real Postgres, parallel requests)", () => {
  it("SLM-4 AC7 concurrency-20-on-3: 20 parallel borrows by 20 members of a 3-copy book → 3 × 201, 17 × 409, available 0, 3 loans", async () => {
    const app = testApp();
    const b = await book(3);
    const members = await Promise.all(Array.from({ length: 20 }, (_, i) => member("ACTIVE", `Member ${i}`)));
    const results = await Promise.all(members.map((m) => borrow(app, b, m)));
    const statuses = results.map((r) => r.res.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(3);
    expect(statuses.filter((s) => s === 409)).toHaveLength(17);
    expect(results.filter((r) => r.res.status === 409).every((r) => r.json.code === "BOOK_UNAVAILABLE")).toBe(true);
    expect(await stock(b)).toMatchObject({ available: 0, open: 3 });
    expect(await loanCount()).toBe(3);
  });

  it("SLM-4 concurrency: 20 parallel borrows, same member, same book → 1 × 201, 19 × 409 ALREADY_BORROWED", async () => {
    const app = testApp();
    const [b, m] = [await book(5), await member()];
    const results = await Promise.all(Array.from({ length: 20 }, () => borrow(app, b, m)));
    expect(results.filter((r) => r.res.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.json.code === "ALREADY_BORROWED")).toHaveLength(19);
    expect(await stock(b)).toMatchObject({ available: 4, open: 1 });
  });

  it("SLM-4 AC8 2 parallel returns of one loan → one 200 + one 409, stock +1 once", async () => {
    const app = testApp();
    const b = await book(1);
    const loan = (await borrow(app, b, await member())).json;
    const results = await Promise.all([giveBack(app, loan.id), giveBack(app, loan.id)]);
    expect(results.map((r) => r.res.status).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.res.status === 409)!.json.code).toBe("LOAN_ALREADY_RETURNED");
    expect(await stock(b)).toMatchObject({ available: 1, open: 0 });
  });

  it("SLM-4 loan-limit race: one member, 8 concurrent borrows of 8 books, limit 5 → exactly 5", async () => {
    const app = testApp();
    const m = await member();
    const books = await Promise.all(Array.from({ length: 8 }, () => book(1)));
    const results = await Promise.all(books.map((b) => borrow(app, b, m)));
    expect(results.filter((r) => r.res.status === 201)).toHaveLength(5);
    expect(results.filter((r) => r.json.code === "LOAN_LIMIT_REACHED")).toHaveLength(3);
    expect((await pool.query("SELECT count(*)::int n FROM loans WHERE member_id = $1 AND returned_at IS NULL", [m])).rows[0].n).toBe(5);
  });

  it("SLM-4 concurrency: borrow and return of the last copy at once both settle; invariant holds", async () => {
    const app = testApp();
    const b = await book(1);
    const loan = (await borrow(app, b, await member())).json;
    const [r1, r2] = await Promise.all([giveBack(app, loan.id), borrow(app, b, await member())]);
    expect(r1.res.status).toBe(200);
    expect([201, 409]).toContain(r2.res.status);
    const s = await stock(b);
    expect(s.available).toBe(r2.res.status === 201 ? 0 : 1);
  });

  it("SLM-4 inventory-invariant: holds after a mixed run of borrows, returns, a total edit and parallel bursts", async () => {
    const app = testApp();
    const books = await Promise.all([book(2), book(3), book(1)]);
    const members = await Promise.all(Array.from({ length: 6 }, (_, i) => member("ACTIVE", `Reader ${i}`)));
    const open: string[] = [];
    for (let round = 0; round < 3; round++) {
      const burst = await Promise.all(members.flatMap((m, i) => [borrow(app, books[(i + round) % 3]!, m)]));
      for (const r of burst) if (r.res.status === 201) open.push(r.json.id);
      await expectInventoryInvariant();
      const toReturn = open.splice(0, 2);
      await Promise.all(toReturn.map((id) => giveBack(app, id)));
      await expectInventoryInvariant();
    }
    // Edit total through the catalog API while loans are open: available follows (total − out).
    const b0 = (await app.request(`/api/books/${books[1]}`, await as(staff.librarian))).json() as Promise<Json>;
    const cur = await b0;
    const put = await app.request(`/api/books/${books[1]}`, await as(staff.librarian, {
      method: "PUT", body: { title: cur.title, author: cur.author, category: cur.category, totalCopies: 6, version: cur.version },
    }));
    expect(put.status).toBe(200);
    await expectInventoryInvariant();
  });
});

/** Waits until a backend is blocked on a row lock while running `pattern` (pg_stat_activity). */
async function waitForLockWaiter(pattern: string, timeoutMs = 10_000) {
  const start = Date.now();
  for (;;) {
    const { rows } = await pool.query(
      "SELECT count(*)::int n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query ILIKE $1",
      [pattern],
    );
    if (rows[0].n > 0) return;
    if (Date.now() - start > timeoutMs) throw new Error(`no backend waiting on a lock for ${pattern}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe("SLM-4 member status under the member row lock (architecture review)", () => {
  it("SLM-4 member-suspend-race: a borrow blocked behind an uncommitted deactivate → 409 MEMBER_INACTIVE, no loan, stock unchanged", async () => {
    const app = testApp();
    const [b, m] = [await book(2), await member()];
    const deactivate = await pool.connect();
    try {
      await deactivate.query("BEGIN");
      await deactivate.query("UPDATE members SET status = 'INACTIVE' WHERE id = $1", [m]);
      const pending = borrow(app, b, m); // must block on SELECT … FOR UPDATE of the member row
      await waitForLockWaiter("%FROM members%FOR UPDATE%");
      await deactivate.query("COMMIT");
      const { res, json } = await pending;
      expect(res.status).toBe(409);
      expect(json.code).toBe("MEMBER_INACTIVE");
    } finally {
      await deactivate.query("ROLLBACK").catch(() => undefined);
      deactivate.release();
    }
    expect(await loanCount()).toBe(0);
    expect(await stock(b)).toMatchObject({ available: 2, open: 0 });
  });

  it("SLM-4 member-suspend-race (opposite order): the borrow commits first, the deactivate then succeeds, the loan stays returnable", async () => {
    const app = testApp();
    const [b, m] = [await book(2), await member()];
    const loan = await borrow(app, b, m);
    expect(loan.res.status).toBe(201);
    const upd = await pool.query("UPDATE members SET status = 'INACTIVE' WHERE id = $1", [m]);
    expect(upd.rowCount).toBe(1);
    expect(await stock(b)).toMatchObject({ available: 1, open: 1 });
    const back = await giveBack(app, loan.json.id);
    expect(back.res.status).toBe(200);
    expect(await stock(b)).toMatchObject({ available: 2, open: 0 });
  });
});

describe("SLM-4 RBAC (rbac-matrix.md: LOAN_PROCESS = Admin, Librarian)", () => {
  it("SLM-4 Supervisor → 403 on borrow and on return; nothing changes", async () => {
    const app = testApp();
    const [b, m] = [await book(2), await member()];
    const denied = await borrow(app, b, m, {}, staff.supervisor);
    expect(denied.res.status).toBe(403);
    expect(denied.json.code).toBe("FORBIDDEN");
    expect(await loanCount()).toBe(0);
    expect(await stock(b)).toMatchObject({ available: 2 });

    const loan = (await borrow(app, b, m)).json;
    const deniedReturn = await giveBack(app, loan.id, staff.supervisor);
    expect(deniedReturn.res.status).toBe(403);
    expect((await pool.query("SELECT returned_at FROM loans WHERE id = $1", [loan.id])).rows[0].returned_at).toBeNull();
    expect(await stock(b)).toMatchObject({ available: 1 });
  });

  it("SLM-4 Admin can borrow; Supervisor can read loans (LOAN_READ); no session → 401", async () => {
    const app = testApp();
    const b = await book(2);
    const loan = await borrow(app, b, await member(), {}, staff.admin);
    expect(loan.res.status).toBe(201);
    expect((await app.request("/api/loans", await as(staff.supervisor))).status).toBe(200);
    expect((await app.request(`/api/loans/${loan.json.id}`, await as(staff.supervisor))).status).toBe(200);
    const anon = await app.request("/api/loans/borrow", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: "{}" });
    expect(anon.status).toBe(401);
    expect((await app.request("/api/loans")).status).toBe(401);
  });
});

describe("SLM-4 AC9 Return screen list (GET /api/loans)", () => {
  it("SLM-4 AC9 status=ACTIVE lists every open loan, overdue first then soonest due; derived status per row", async () => {
    const now = new Date();
    const app = testApp({ clock: () => now });
    const b = await book(5, "Clean Code");
    const [m1, m2, m3, m4] = [await member("ACTIVE", "Ann"), await member("ACTIVE", "Ben"), await member("ACTIVE", "Cat"), await member("ACTIVE", "Dan")];
    const ins = async (m: string, dueOffsetDays: number, returned = false) => {
      await pool.query(
        `INSERT INTO loans (book_id, member_id, processed_by, borrowed_at, due_at, returned_at, returned_by)
         VALUES ($1, $2, $3, $4::timestamptz - interval '30 days', $4::timestamptz + ($5 || ' days')::interval, $6, $7)`,
        [b, m, staff.librarian, now.toISOString(), String(dueOffsetDays), returned ? now : null, returned ? staff.librarian : null],
      );
      if (!returned) await pool.query("UPDATE books SET available_copies = available_copies - 1 WHERE id = $1", [b]);
    };
    await ins(m1, 5);
    await ins(m2, -2);
    await ins(m3, 1);
    await ins(m4, -10, true);
    const res = await app.request("/api/loans?status=ACTIVE", await as(staff.librarian));
    const page = (await res.json()) as Json;
    expect(page.total).toBe(3);
    expect(page.items.map((l: Json) => [l.member.fullName, l.status])).toEqual([["Ben", "OVERDUE"], ["Cat", "ACTIVE"], ["Ann", "ACTIVE"]]);

    const overdue = (await (await app.request("/api/loans?status=OVERDUE", await as(staff.librarian))).json()) as Json;
    expect(overdue.items.map((l: Json) => l.member.fullName)).toEqual(["Ben"]);

    const byName = (await (await app.request("/api/loans?status=ACTIVE&q=ann", await as(staff.librarian))).json()) as Json;
    expect(byName.items.map((l: Json) => l.member.fullName)).toEqual(["Ann"]);
    const byTitle = (await (await app.request("/api/loans?status=ACTIVE&q=clean", await as(staff.librarian))).json()) as Json;
    expect(byTitle.total).toBe(3);
    const special = await app.request(`/api/loans?q=${encodeURIComponent("%';--")}`, await as(staff.librarian));
    expect(special.status).toBe(200);
    expect(((await special.json()) as Json).total).toBe(0);
  });
});
