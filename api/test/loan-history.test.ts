import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { as, pool, resetDb, seedStaff, testApp } from "./support";

afterAll(() => pool.end());
let staff: Awaited<ReturnType<typeof seedStaff>>;
beforeEach(async () => { await resetDb(); staff = await seedStaff(); });

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- test convenience
const MIN = 60_000;
const DAY = 86_400_000;

async function book(title: string, total = 5): Promise<string> {
  return (await pool.query(
    "INSERT INTO books (title, author, category, total_copies, available_copies) VALUES ($1, 'Author', 'Cat', $2, $2) RETURNING id",
    [title, total],
  )).rows[0].id;
}
async function member(fullName: string): Promise<string> {
  return (await pool.query("INSERT INTO members (full_name, email) VALUES ($1, $2) RETURNING id", [fullName, `${crypto.randomUUID()}@example.org`])).rows[0].id;
}
/** A loan with explicit times (raw SQL, keeps the stock in step so the inventory stays consistent). */
async function loan(bookId: string, memberId: string, t: { borrowedAt: Date; dueAt: Date; returnedAt?: Date }): Promise<string> {
  const id = (await pool.query(
    `INSERT INTO loans (book_id, member_id, processed_by, borrowed_at, due_at, returned_at, returned_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [bookId, memberId, staff.librarian, t.borrowedAt, t.dueAt, t.returnedAt ?? null, t.returnedAt ? staff.librarian : null],
  )).rows[0].id;
  if (!t.returnedAt) await pool.query("UPDATE books SET available_copies = available_copies - 1 WHERE id = $1", [bookId]);
  return id;
}
async function get(app: ReturnType<typeof testApp>, path: string, by = staff.librarian) {
  const res = await app.request(path, await as(by));
  return { res, json: (await res.json()) as Json };
}

describe("SLM-5 loan history", () => {
  it("SLM-5 AC3 a loan due one minute ago is OVERDUE; once returned it is RETURNED", async () => {
    const now = new Date();
    const app = testApp({ clock: () => now });
    const b = await book("Clean Code");
    const id = await loan(b, await member("Sara Haddad"), { borrowedAt: new Date(now.getTime() - 14 * DAY), dueAt: new Date(now.getTime() - MIN) });
    expect((await get(app, `/api/loans/${id}`)).json.status).toBe("OVERDUE");
    expect((await get(app, "/api/loans?status=OVERDUE")).json.items.map((l: Json) => l.id)).toEqual([id]);

    const ret = await app.request(`/api/loans/${id}/return`, await as(staff.librarian, { method: "POST" }));
    expect(ret.status).toBe(200);
    expect((await get(app, `/api/loans/${id}`)).json.status).toBe("RETURNED");
    expect((await get(app, "/api/loans?status=OVERDUE")).json.total).toBe(0);
    expect((await get(app, "/api/loans?status=RETURNED")).json.items.map((l: Json) => l.id)).toEqual([id]);
  });

  it("SLM-5 AC3 the derivation follows the injected clock (no sleeps): ACTIVE now, OVERDUE a day after the due date", async () => {
    const now = new Date();
    const b = await book("Refactoring");
    const id = await loan(b, await member("Omar Nasser"), { borrowedAt: now, dueAt: new Date(now.getTime() + 3 * DAY) });
    expect((await get(testApp({ clock: () => now }), `/api/loans/${id}`)).json.status).toBe("ACTIVE");
    const later = new Date(now.getTime() + 4 * DAY);
    expect((await get(testApp({ clock: () => later }), `/api/loans/${id}`)).json.status).toBe("OVERDUE");
  });

  it("SLM-5 AC1 + AC5 each row has book, member, dates, processed by and status; no fee, fine or payment field", async () => {
    const now = new Date();
    const app = testApp({ clock: () => now });
    await loan(await book("Clean Code"), await member("Sara Haddad"), { borrowedAt: new Date(now.getTime() - DAY), dueAt: new Date(now.getTime() + DAY) });
    const { json } = await get(app, "/api/loans");
    const row = json.items[0];
    expect(Object.keys(row).sort()).toEqual(["book", "borrowedAt", "dueAt", "id", "member", "processedBy", "returnedAt", "returnedBy", "status"]);
    expect(row).toMatchObject({ book: { title: "Clean Code" }, member: { fullName: "Sara Haddad" }, processedBy: { name: "Layla Librarian" }, returnedAt: null });
    expect(JSON.stringify(json)).not.toMatch(/fee|fine|payment/i);
  });

  it("SLM-5 AC2 filters (status, member, book, borrowed date range, q) and sorts; list, total and pages agree", async () => {
    const now = new Date("2026-11-24T12:00:00.000Z");
    const app = testApp({ clock: () => now });
    const [cc, ddia] = [await book("Clean Code"), await book("Designing Data-Intensive Applications")];
    const [sara, omar] = [await member("Sara Haddad"), await member("Omar Nasser")];
    const at = (iso: string) => new Date(iso);
    const l1 = await loan(cc, sara, { borrowedAt: at("2026-11-01T09:00:00Z"), dueAt: at("2026-11-15T09:00:00Z") }); // overdue
    const l2 = await loan(ddia, sara, { borrowedAt: at("2026-11-10T09:00:00Z"), dueAt: at("2026-11-24T09:00:00Z"), returnedAt: at("2026-11-20T09:00:00Z") });
    const l3 = await loan(ddia, omar, { borrowedAt: at("2026-11-20T09:00:00Z"), dueAt: at("2026-12-04T09:00:00Z") }); // active
    const ids = async (qs: string) => {
      const { res, json } = await get(app, `/api/loans${qs}`);
      expect(res.status, qs).toBe(200);
      return { ids: json.items.map((l: Json) => l.id), total: json.total };
    };

    expect(await ids("")).toEqual({ ids: [l3, l2, l1], total: 3 }); // default: newest borrowed first
    expect(await ids("?status=ACTIVE")).toEqual({ ids: [l1, l3], total: 2 }); // open loans: overdue first, then soonest due
    expect(await ids("?status=OVERDUE")).toEqual({ ids: [l1], total: 1 });
    expect(await ids("?status=RETURNED")).toEqual({ ids: [l2], total: 1 });
    expect(await ids(`?memberId=${sara}`)).toEqual({ ids: [l2, l1], total: 2 });
    expect(await ids(`?bookId=${ddia}`)).toEqual({ ids: [l3, l2], total: 2 });
    expect(await ids(`?memberId=${sara}&bookId=${ddia}`)).toEqual({ ids: [l2], total: 1 });
    expect(await ids("?from=2026-11-05&to=2026-11-10")).toEqual({ ids: [l2], total: 1 }); // a day as `to` covers that day
    expect(await ids("?from=2026-11-10T09:00:01Z")).toEqual({ ids: [l3], total: 1 });
    expect(await ids("?q=omar")).toEqual({ ids: [l3], total: 1 });
    expect(await ids("?q=designing")).toEqual({ ids: [l3, l2], total: 2 });
    expect(await ids("?sort=dueAt")).toEqual({ ids: [l1, l2, l3], total: 3 });
    expect(await ids("?sort=-dueAt")).toEqual({ ids: [l3, l2, l1], total: 3 });
    expect((await ids("?sort=returnedAt")).ids[0]).toBe(l2); // open loans (null) last
    expect(await ids("?size=2&page=2")).toEqual({ ids: [l1], total: 3 });
    expect(await ids("?q=nobody")).toEqual({ ids: [], total: 0 });

    expect((await get(app, "/api/loans?sort=fee")).res.status).toBe(400);
    expect((await get(app, "/api/loans?status=LATE")).res.status).toBe(400);
    expect((await get(app, "/api/loans?from=yesterday")).res.status).toBe(400);
  });

  it("SLM-5 AC4 the OVERDUE filter returns exactly the rows whose derived status is OVERDUE (one derivation)", async () => {
    const now = new Date();
    const app = testApp({ clock: () => now });
    const b = await book("Many", 20);
    const offsets = [-5 * DAY, -MIN, MIN, 2 * DAY, -3 * DAY, 10 * DAY];
    for (const [i, off] of offsets.entries()) {
      await loan(b, await member(`Reader ${i}`), { borrowedAt: new Date(now.getTime() - 20 * DAY), dueAt: new Date(now.getTime() + off), ...(i === 4 ? { returnedAt: now } : {}) });
    }
    const all = (await get(app, "/api/loans?size=100")).json.items as Json[];
    const derived = all.filter((l) => l.status === "OVERDUE").map((l) => l.id).sort();
    const filtered = ((await get(app, "/api/loans?status=OVERDUE&size=100")).json.items as Json[]).map((l) => l.id).sort();
    expect(filtered).toEqual(derived);
    expect(filtered).toHaveLength(2); // −5 days and −1 minute; the returned one (−3 days) is RETURNED
  });

  it("SLM-5 read-only for everyone: Supervisor reads history (LOAN_READ); no session → 401", async () => {
    const app = testApp();
    expect((await get(app, "/api/loans", staff.supervisor)).res.status).toBe(200);
    expect((await app.request("/api/loans")).status).toBe(401);
  });
});
