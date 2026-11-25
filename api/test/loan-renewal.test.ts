import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { as, pool, resetDb, seedStaff, testApp } from "./support";

/**
 * SLM-18 loan renewal (POST /api/loans/:id/renew): an open, not-overdue loan is extended once, by LOAN_DAYS
 * counted from its current due date. Every refusal leaves the loan and the stock as they were.
 */
afterAll(() => pool.end());
let staff: Awaited<ReturnType<typeof seedStaff>>;
beforeEach(async () => {
  await resetDb();
  staff = await seedStaff();
});

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- test convenience
const DAY = 86_400_000;
const T0 = new Date("2026-11-20T09:00:00.000Z");

async function book(totalCopies = 2): Promise<string> {
  const r = await pool.query(
    "INSERT INTO books (title, author, category, total_copies, available_copies) VALUES ('Clean Code', 'Author', 'Cat', $1, $1) RETURNING id",
    [totalCopies],
  );
  return r.rows[0].id;
}
async function member(): Promise<string> {
  const r = await pool.query("INSERT INTO members (full_name, email) VALUES ('Sara Haddad', $1) RETURNING id", [
    `m-${crypto.randomUUID()}@example.org`,
  ]);
  return r.rows[0].id;
}

/** An app whose clock the test moves; a loan borrowed at T0 (due T0 + 14 days unless LOAN_DAYS says otherwise). */
async function setup(env: Record<string, string> = {}) {
  const clock = { now: T0 };
  const app = testApp({ clock: () => clock.now, env });
  const b = await book();
  const res = await app.request(
    "/api/loans/borrow",
    await as(staff.librarian, { method: "POST", body: { bookId: b, memberId: await member() } }),
  );
  const loan = (await res.json()) as Json;
  const renew = async (id = loan.id as string, by = staff.librarian) => {
    const r = await app.request(`/api/loans/${id}/renew`, await as(by, { method: "POST" }));
    return { res: r, json: (await r.json()) as Json };
  };
  const row = async () =>
    (await pool.query("SELECT due_at, renewed_at, renewed_by, returned_at FROM loans WHERE id = $1", [loan.id]))
      .rows[0];
  const available = async () =>
    (await pool.query("SELECT available_copies FROM books WHERE id = $1", [b])).rows[0].available_copies as number;
  return { app, clock, loan, renew, row, available };
}

describe("SLM-18 renew", () => {
  it("SLM-18 happy renew → 200, due date + LOAN_DAYS from the current due date, renewedAt set, renewed_by recorded, stock unchanged", async () => {
    const t = await setup();
    t.clock.now = new Date(T0.getTime() + 3 * DAY);
    const { res, json } = await t.renew();
    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      id: t.loan.id,
      status: "ACTIVE",
      dueAt: new Date(T0.getTime() + 28 * DAY).toISOString(),
      renewedAt: t.clock.now.toISOString(),
      borrowedAt: T0.toISOString(),
      returnedAt: null,
    });
    expect((await t.row()).renewed_by).toBe(staff.librarian);
    expect(await t.available()).toBe(1);

    // Reads carry the marker: the loan itself and the history list.
    const one = (await (await t.app.request(`/api/loans/${t.loan.id}`, await as(staff.supervisor))).json()) as Json;
    expect(one.renewedAt).toBe(json.renewedAt);
    const list = (await (await t.app.request("/api/loans", await as(staff.supervisor))).json()) as Json;
    expect(list.items[0].renewedAt).toBe(json.renewedAt);
  });

  it("SLM-18 a loan that was never renewed reads renewedAt null", async () => {
    const t = await setup();
    expect(t.loan.renewedAt).toBeNull();
  });

  it("SLM-18 the LOAN_DAYS config sets the renewal period; an Admin can renew", async () => {
    const t = await setup({ LOAN_DAYS: "7" });
    const { res, json } = await t.renew(undefined, staff.admin);
    expect(res.status).toBe(200);
    expect(json.dueAt).toBe(new Date(T0.getTime() + 14 * DAY).toISOString());
    expect((await t.row()).renewed_by).toBe(staff.admin);
  });

  it("SLM-18 a loan due exactly now is not overdue yet, so it can be renewed", async () => {
    const t = await setup();
    t.clock.now = new Date(t.loan.dueAt);
    const { res, json } = await t.renew();
    expect(res.status).toBe(200);
    expect(json.dueAt).toBe(new Date(T0.getTime() + 28 * DAY).toISOString());
  });

  it("SLM-18 overdue → 409 LOAN_OVERDUE with the due date; nothing changes", async () => {
    const t = await setup();
    t.clock.now = new Date(new Date(t.loan.dueAt).getTime() + 1);
    const { res, json } = await t.renew();
    expect(res.status).toBe(409);
    expect(json).toMatchObject({ code: "LOAN_OVERDUE", context: { dueAt: t.loan.dueAt } });
    expect(json.detail).toBe(
      "This loan was due 4 Dec 2026 and is overdue, so it can't be renewed. Record the return instead.",
    );
    const row = await t.row();
    expect(row.due_at.toISOString()).toBe(t.loan.dueAt);
    expect(row.renewed_at).toBeNull();
  });

  it("SLM-18 already renewed → 409 LOAN_ALREADY_RENEWED; the due date moves once only", async () => {
    const t = await setup();
    const first = await t.renew();
    const { res, json } = await t.renew(undefined, staff.admin);
    expect(res.status).toBe(409);
    expect(json).toMatchObject({
      code: "LOAN_ALREADY_RENEWED",
      context: { renewedAt: first.json.renewedAt, dueAt: first.json.dueAt },
    });
    expect(json.detail).toBe("This loan was already renewed on 20 Nov 2026. A loan can be renewed only once.");
    const row = await t.row();
    expect(row.due_at.toISOString()).toBe(first.json.dueAt);
    expect(row.renewed_by).toBe(staff.librarian);
  });

  it("SLM-18 renewed and then overdue → still LOAN_ALREADY_RENEWED (the lasting reason comes first)", async () => {
    const t = await setup();
    const first = await t.renew();
    t.clock.now = new Date(new Date(first.json.dueAt).getTime() + DAY);
    expect((await t.renew()).json.code).toBe("LOAN_ALREADY_RENEWED");
  });

  it("SLM-18 returned → 409 LOAN_ALREADY_RETURNED; nothing changes", async () => {
    const t = await setup();
    await t.app.request(`/api/loans/${t.loan.id}/return`, await as(staff.librarian, { method: "POST" }));
    const { res, json } = await t.renew();
    expect(res.status).toBe(409);
    expect(json).toMatchObject({ code: "LOAN_ALREADY_RETURNED", context: { returnedBy: "Layla Librarian" } });
    const row = await t.row();
    expect(row.due_at.toISOString()).toBe(t.loan.dueAt);
    expect(row.renewed_at).toBeNull();
    expect(await t.available()).toBe(2);
  });

  it("SLM-18 unknown loan id → 404 NOT_FOUND; malformed id → 400", async () => {
    const t = await setup();
    const unknown = await t.renew(crypto.randomUUID());
    expect(unknown.res.status).toBe(404);
    expect(unknown.json.code).toBe("NOT_FOUND");
    const bad = await t.renew("123");
    expect(bad.res.status).toBe(400);
    expect(bad.json.code).toBe("VALIDATION_FAILED");
  });

  it("SLM-18 RBAC: Supervisor → 403 FORBIDDEN and nothing changes; no session → 401", async () => {
    const t = await setup();
    const { res, json } = await t.renew(undefined, staff.supervisor);
    expect(res.status).toBe(403);
    expect(json.code).toBe("FORBIDDEN");
    expect((await t.row()).renewed_at).toBeNull();
    const anon = await t.app.request(`/api/loans/${t.loan.id}/renew`, {
      method: "POST",
      headers: { origin: "http://localhost" },
    });
    expect(anon.status).toBe(401);
  });

  it("SLM-18 concurrency: 10 parallel renewals of one loan → exactly one 200, nine 409 LOAN_ALREADY_RENEWED, due date moved once", async () => {
    const t = await setup();
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => t.renew(undefined, i % 2 ? staff.admin : staff.librarian)),
    );
    const ok = results.filter((r) => r.res.status === 200);
    expect(ok).toHaveLength(1);
    const refused = results.filter((r) => r.res.status === 409);
    expect(refused).toHaveLength(9);
    for (const r of refused) expect(r.json.code).toBe("LOAN_ALREADY_RENEWED");
    const row = await t.row();
    expect(row.due_at.toISOString()).toBe(new Date(T0.getTime() + 28 * DAY).toISOString());
    expect(row.due_at.toISOString()).toBe(ok[0]!.json.dueAt);
  });

  it("SLM-18 the database refuses a renewal marker without who renewed it, or one before the borrow (loans_renewed_ck)", async () => {
    const t = await setup();
    const noBy = await pool
      .query("UPDATE loans SET renewed_at = due_at WHERE id = $1", [t.loan.id])
      .catch((e: { constraint?: string }) => e);
    expect((noBy as { constraint?: string }).constraint).toBe("loans_renewed_ck");
    const early = await pool
      .query("UPDATE loans SET renewed_at = borrowed_at - interval '1 day', renewed_by = $2 WHERE id = $1", [
        t.loan.id,
        staff.librarian,
      ])
      .catch((e: { constraint?: string }) => e);
    expect((early as { constraint?: string }).constraint).toBe("loans_renewed_ck");
  });
});
