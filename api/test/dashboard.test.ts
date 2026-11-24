import { DashboardSummarySchema } from "@slm/contracts";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { as, pool, resetDb, seedStaff, testApp } from "./support";

afterAll(() => pool.end());
let staff: Awaited<ReturnType<typeof seedStaff>>;
beforeEach(async () => { await resetDb(); staff = await seedStaff(); });

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- test convenience

async function book(title: string, total: number, available: number, extra: { archived?: boolean; createdAt?: string } = {}) {
  const r = await pool.query(
    `INSERT INTO books (title, author, category, total_copies, available_copies, archived_at, created_at)
     VALUES ($1, 'Author of ' || $1, 'Fixtures', $2, $3, $4, coalesce($5::timestamptz, now())) RETURNING id`,
    [title, total, available, extra.archived ? new Date() : null, extra.createdAt ?? null],
  );
  return r.rows[0].id as string;
}
async function member(name: string, status: "ACTIVE" | "INACTIVE" = "ACTIVE") {
  const r = await pool.query("INSERT INTO members (full_name, email, status) VALUES ($1, $2, $3) RETURNING id", [name, `${Math.random()}@x.io`, status]);
  return r.rows[0].id as string;
}
/** daysAgo = when it was borrowed, dueIn = days until due (negative = already late), returned = closed loan. */
async function loan(bookId: string, memberId: string, o: { daysAgo?: number; dueIn?: number; returned?: boolean } = {}) {
  const daysAgo = o.daysAgo ?? 1;
  const dueIn = o.dueIn ?? 10;
  const r = await pool.query(
    `INSERT INTO loans (book_id, member_id, processed_by, returned_by, borrowed_at, due_at, returned_at)
     VALUES ($1, $2, $3, $4, now() - make_interval(secs => $5::float8 * 86400), now() + make_interval(secs => $6::float8 * 86400), $7) RETURNING id`,
    [bookId, memberId, staff.librarian, o.returned ? staff.librarian : null, daysAgo, dueIn, o.returned ? new Date() : null],
  );
  return r.rows[0].id as string;
}
async function summary(who = staff.librarian) {
  const res = await testApp().request("/api/dashboard/summary", await as(who));
  return { res, json: (await res.json()) as Json };
}

describe("SLM-12 dashboard", () => {
  it("SLM-12 AC1 KPIs: titles, copies, available, borrowed, members, active and overdue loans", async () => {
    const a = await book("Alpha", 5, 3); // 2 on loan
    const b = await book("Beta", 2, 1); // 1 on loan
    await book("Gamma", 4, 4);
    const m1 = await member("Ann"), m2 = await member("Bob"), m3 = await member("Cy");
    await member("Dee", "INACTIVE");
    await loan(a, m1, { dueIn: 5 });
    await loan(a, m2, { daysAgo: 20, dueIn: -3 }); // overdue
    await loan(b, m3, { dueIn: 2 });
    await loan(b, m1, { daysAgo: 9, dueIn: 4, returned: true }); // history only

    const { res, json } = await summary();
    expect(res.status).toBe(200);
    expect(DashboardSummarySchema.safeParse(json).success).toBe(true);
    expect(json.kpis).toEqual({
      totalTitles: 3, totalCopies: 11, availableCopies: 8, borrowedCopies: 3,
      activeMembers: 3, inactiveMembers: 1, activeLoans: 3, overdueLoans: 1,
    });
  });

  it("SLM-12 AC2 invariant: available + borrowed = total; overdue = open and past due (due now is not overdue yet)", async () => {
    const a = await book("Alpha", 3, 0);
    const m1 = await member("Ann"), m2 = await member("Bob"), m3 = await member("Cy");
    await loan(a, m1, { daysAgo: 5, dueIn: -1 });
    await loan(a, m2, { daysAgo: 5, dueIn: 1 });
    await loan(a, m3, { daysAgo: 5, dueIn: 0.001 }); // still in the future by a hair
    const { json } = await summary();
    const k = json.kpis;
    expect(k.availableCopies + k.borrowedCopies).toBe(k.totalCopies);
    expect(k.overdueLoans).toBe(1);
    expect(k.activeLoans).toBe(3);
    const statuses = (json.recentBorrowings as Json[]).map((l) => l.status).sort();
    expect(statuses).toEqual(["ACTIVE", "ACTIVE", "OVERDUE"]);
  });

  it("SLM-12 AC2 archived books are excluded from KPIs, popular and recently added", async () => {
    await book("Visible", 2, 2);
    const gone = await book("Archived", 9, 9, { archived: true });
    const m = await member("Ann");
    await loan(gone, m, { returned: true });
    const { json } = await summary();
    expect(json.kpis).toMatchObject({ totalTitles: 1, totalCopies: 2, availableCopies: 2, borrowedCopies: 0 });
    expect(json.popularBooks).toEqual([]);
    expect((json.recentlyAdded as Json[]).map((b) => b.title)).toEqual(["Visible"]);
  });

  it("SLM-12 AC3 recent borrowings: newest 8, with book, member, dates and derived status", async () => {
    const a = await book("Alpha", 20, 20);
    for (let i = 0; i < 10; i++) {
      const m = await member(`Member ${i}`);
      await loan(a, m, { daysAgo: 12 - i, dueIn: i === 9 ? -1 : 7 }); // the newest (i=9, 3 days ago) is overdue
    }
    const { json } = await summary();
    const rows = json.recentBorrowings as [Json, ...Json[]];
    expect(rows).toHaveLength(8);
    expect(rows[0]).toMatchObject({ status: "OVERDUE", book: { title: "Alpha", author: "Author of Alpha" }, member: { fullName: "Member 9" } });
    expect(rows[0].member.memberNumber).toMatch(/^M-\d{6}$/);
    expect(rows.map((r) => r.member.fullName)).toEqual(["Member 9", "Member 8", "Member 7", "Member 6", "Member 5", "Member 4", "Member 3", "Member 2"]);
    expect(Date.parse(rows[0].borrowedAt)).toBeGreaterThan(Date.parse(rows[7]!.borrowedAt));
  });

  it("SLM-12 AC3 recent borrowings show RETURNED for closed loans", async () => {
    const a = await book("Alpha", 1, 1);
    await loan(a, await member("Ann"), { returned: true });
    const { json } = await summary();
    expect(json.recentBorrowings[0].status).toBe("RETURNED");
  });

  it("SLM-12 AC3 popular books: top 5 by loans in the last 30 days, with live availability", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) ids.push(await book(`Pop ${i}`, 3, i === 0 ? 0 : 3));
    const old = await book("Old favourite", 3, 3);
    // Pop i gets (6 - i) loans in the window; the old favourite has many loans, all outside it.
    for (let i = 0; i < 6; i++) for (let n = 0; n < 6 - i; n++) await loan(ids[i]!, await member(`m${i}-${n}`), { daysAgo: 2 + n, dueIn: 5, returned: true });
    for (let n = 0; n < 8; n++) await loan(old, await member(`o${n}`), { daysAgo: 40 + n, dueIn: -30, returned: true });
    const { json } = await summary();
    const pop = json.popularBooks as Json[];
    expect(pop.map((b) => [b.title, b.loansLast30Days])).toEqual([["Pop 0", 6], ["Pop 1", 5], ["Pop 2", 4], ["Pop 3", 3], ["Pop 4", 2]]);
    expect(pop[0]).toMatchObject({ availableCopies: 0, totalCopies: 3 });
  });

  it("SLM-12 AC3 recently added: the last 3 books, newest first", async () => {
    await book("B1", 1, 1, { createdAt: "2026-01-01T00:00:00Z" });
    await book("B2", 1, 1, { createdAt: "2026-02-01T00:00:00Z" });
    await book("B3", 1, 1, { createdAt: "2026-03-01T00:00:00Z" });
    await book("B4", 2, 2, { createdAt: "2026-04-01T00:00:00Z" });
    const { json } = await summary();
    expect((json.recentlyAdded as Json[]).map((b) => b.title)).toEqual(["B4", "B3", "B2"]);
    expect(json.recentlyAdded[0]).toMatchObject({ totalCopies: 2, availableCopies: 2 });
  });

  it("SLM-12 AC3 empty library: zeros and empty lists", async () => {
    const { res, json } = await summary();
    expect(res.status).toBe(200);
    expect(json.kpis).toEqual({ totalTitles: 0, totalCopies: 0, availableCopies: 0, borrowedCopies: 0, activeMembers: 0, inactiveMembers: 0, activeLoans: 0, overdueLoans: 0 });
    expect(json.recentBorrowings).toEqual([]);
    expect(json.popularBooks).toEqual([]);
    expect(json.recentlyAdded).toEqual([]);
  });

  it("SLM-12 AC4 RBAC: admin, librarian and supervisor get 200; the read model changes nothing", async () => {
    const a = await book("Alpha", 2, 1);
    await loan(a, await member("Ann"));
    const before = (await pool.query("SELECT (SELECT count(*) FROM loans) l, (SELECT sum(available_copies) FROM books) a")).rows[0];
    for (const who of [staff.admin, staff.librarian, staff.supervisor]) expect((await summary(who)).res.status).toBe(200);
    const after = (await pool.query("SELECT (SELECT count(*) FROM loans) l, (SELECT sum(available_copies) FROM books) a")).rows[0];
    expect(after).toEqual(before);
  });

  it("SLM-12 RBAC: no session → 401; disabled staff → 403; writes are not routed", async () => {
    const app = testApp();
    expect((await app.request("/api/dashboard/summary")).status).toBe(401);
    expect((await summary(staff.disabled)).res.status).toBe(403);
    expect((await app.request("/api/dashboard/summary", await as(staff.admin, { method: "POST", body: {} }))).status).toBe(404);
  });
});
