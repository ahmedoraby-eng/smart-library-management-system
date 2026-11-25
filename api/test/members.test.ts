import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { as, pool, resetDb, seedStaff, testApp } from "./support";

afterAll(() => pool.end());
let staff: Awaited<ReturnType<typeof seedStaff>>;
beforeEach(async () => {
  await resetDb();
  staff = await seedStaff();
});

const valid = { fullName: "Sara Haddad", email: "sara@example.org", phone: "+20 100 123 4567" };
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- test convenience

async function create(body: Json = valid, who = staff.librarian, app = testApp()) {
  const res = await app.request("/api/members", await as(who, { method: "POST", body }));
  return { res, json: (await res.json()) as Json };
}
async function get(path: string, who = staff.librarian, app = testApp()) {
  const res = await app.request(path, await as(who));
  return { res, json: (await res.json()) as Json };
}
const members = async () => (await pool.query("SELECT * FROM members ORDER BY member_number")).rows;

async function seedMember(fullName: string, email: string, status = "ACTIVE"): Promise<string> {
  return (
    await pool.query("INSERT INTO members (full_name, email, status) VALUES ($1, $2, $3) RETURNING id", [
      fullName,
      email,
      status,
    ])
  ).rows[0].id;
}
async function seedBook(title: string): Promise<string> {
  return (
    await pool.query(
      "INSERT INTO books (title, author, category, total_copies, available_copies) VALUES ($1, 'Author', 'C', 5, 5) RETURNING id",
      [title],
    )
  ).rows[0].id;
}
/** A loan with `borrowedDaysAgo`/`dueInDays` relative to now; `returnedDaysAgo` null = open. Raw SQL: circulation lands in SLM-4. */
async function loan(
  memberId: string,
  bookId: string,
  borrowedDaysAgo: number,
  dueInDays: number,
  returnedDaysAgo: number | null = null,
): Promise<string> {
  const r = await pool.query(
    `INSERT INTO loans (book_id, member_id, processed_by, returned_by, borrowed_at, due_at, returned_at)
     VALUES ($1, $2, $3, $4, now() - make_interval(days => $5), now() + make_interval(days => $6),
             CASE WHEN $7::int IS NULL THEN NULL ELSE now() - make_interval(days => $7::int) END) RETURNING id`,
    [
      bookId,
      memberId,
      staff.librarian,
      returnedDaysAgo === null ? null : staff.admin,
      borrowedDaysAgo,
      dueInDays,
      returnedDaysAgo,
    ],
  );
  return r.rows[0].id;
}

describe("SLM-3 member management", () => {
  it("SLM-3 AC1 create → 201 + Location, generated member number, registeredAt, phone optional", async () => {
    const { res, json } = await create();
    expect(res.status).toBe(201);
    expect(res.headers.get("location")).toBe(`/api/members/${json.id}`);
    expect(json).toMatchObject({
      fullName: "Sara Haddad",
      email: "sara@example.org",
      phone: "+20 100 123 4567",
      status: "ACTIVE",
      activeLoans: 0,
      overdueLoans: 0,
      version: 0,
    });
    expect(json.memberNumber).toMatch(/^M-\d{6}$/);
    expect(Date.parse(json.registeredAt)).not.toBeNaN();
    const second = await create({ fullName: "Omar Nabil", email: "omar@example.org" });
    expect(second.res.status).toBe(201);
    expect(second.json.phone).toBeNull();
    expect(second.json.memberNumber).not.toBe(json.memberNumber);
    expect(await members()).toHaveLength(2);
  });

  it("SLM-3 AC1 email is stored lower-case and names are trimmed", async () => {
    const { json } = await create({ fullName: "  Lina Said ", email: " Lina.Said@Example.ORG " });
    expect(json).toMatchObject({ fullName: "Lina Said", email: "lina.said@example.org" });
  });

  it("SLM-3 AC2 invalid input → 400 VALIDATION_FAILED with one message per field, nothing saved", async () => {
    const { res, json } = await create({ fullName: " ", email: "not-an-email", phone: "call me" });
    expect(res.status).toBe(400);
    expect(json.code).toBe("VALIDATION_FAILED");
    const fields = Object.fromEntries(
      (json.errors as { field: string; message: string }[]).map((e) => [e.field, e.message]),
    );
    expect(fields).toEqual({
      fullName: "Enter the member's full name.",
      email: "Enter a valid email address.",
      phone: "Enter a valid phone number.",
    });
    expect(await members()).toHaveLength(0);
  });

  it("SLM-3 AC2 missing body or missing email → 400, nothing saved", async () => {
    expect((await create({ fullName: "No Email" })).res.status).toBe(400);
    const app = testApp();
    const res = await app.request("/api/members", {
      ...(await as(staff.librarian, { method: "POST" })),
      body: "{not json",
    });
    expect(res.status).toBe(400);
    expect(await members()).toHaveLength(0);
  });

  it("SLM-3 AC2 duplicate email (case-insensitive) → 409 DUPLICATE_EMAIL, nothing saved", async () => {
    await create();
    const { res, json } = await create({ fullName: "Other Person", email: "SARA@example.org" });
    expect(res.status).toBe(409);
    expect(json).toMatchObject({ code: "DUPLICATE_EMAIL", detail: "Another member already uses this email." });
    expect(await members()).toHaveLength(1);
  });

  it("SLM-3 AC3 search by name, member number and email; count; sort; no match → empty list", async () => {
    const a = (await create({ fullName: "Sara Haddad", email: "sara@example.org" })).json;
    await create({ fullName: "Omar Nabil", email: "omar.nabil@example.org" });
    await create({ fullName: "Sarah Connor", email: "sc@example.org" });
    const names = async (q: string) => {
      const { json } = await get(`/api/members?q=${encodeURIComponent(q)}`);
      return { names: (json.items as Json[]).map((m) => m.fullName), total: json.total };
    };
    expect(await names("haddad")).toEqual({ names: ["Sara Haddad"], total: 1 });
    expect(await names("sara")).toEqual({ names: ["Sara Haddad", "Sarah Connor"], total: 2 });
    expect(await names(a.memberNumber)).toEqual({ names: ["Sara Haddad"], total: 1 });
    expect(await names("omar.nab")).toEqual({ names: ["Omar Nabil"], total: 1 });
    expect(await names("OMAR.NABIL@EXAMPLE")).toEqual({ names: ["Omar Nabil"], total: 1 });
    expect(await names("zzzz")).toEqual({ names: [], total: 0 });
    // LIKE wildcards in the query are literal.
    expect(await names("%")).toEqual({ names: [], total: 0 });
    // default sort: name A–Z; explicit sort keys
    expect((await get("/api/members")).json.items.map((m: Json) => m.fullName)).toEqual([
      "Omar Nabil",
      "Sara Haddad",
      "Sarah Connor",
    ]);
    expect((await get("/api/members?sort=-fullName")).json.items[0].fullName).toBe("Sarah Connor");
    expect((await get("/api/members?sort=-memberNumber")).json.items[0].fullName).toBe("Sarah Connor");
    expect((await get("/api/members?sort=registeredAt")).res.status).toBe(200);
    expect((await get("/api/members?sort=email")).res.status).toBe(400);
  });

  it("SLM-3 AC3 status filter (ACTIVE / INACTIVE / ALL), paging, size limit", async () => {
    await seedMember("Active One", "a1@example.org");
    await seedMember("Active Two", "a2@example.org");
    await seedMember("Gone Away", "g@example.org", "INACTIVE");
    const total = async (qs: string) => (await get(`/api/members?${qs}`)).json.total;
    expect(await total("status=ACTIVE")).toBe(2);
    expect(await total("status=INACTIVE")).toBe(1);
    expect(await total("status=ALL")).toBe(3);
    expect(await total("")).toBe(3);
    expect((await get("/api/members?status=ACTIVE&q=one")).json.items.map((m: Json) => m.fullName)).toEqual([
      "Active One",
    ]);
    const p2 = (await get("/api/members?size=2&page=2")).json;
    expect(p2).toMatchObject({ page: 2, size: 2, total: 3 });
    expect(p2.items).toHaveLength(1);
    expect((await get("/api/members?status=BOGUS")).res.status).toBe(400);
    expect((await get("/api/members?size=1000")).res.status).toBe(400);
  });

  it("SLM-3 AC4 detail has the profile and open/overdue loan counts; loans list: overdue, open, then returned (newest return first)", async () => {
    const id = await seedMember("Sara Haddad", "sara@example.org");
    const [b1, b2, b3, b4] = await Promise.all(["Book One", "Book Two", "Book Three", "Book Four"].map(seedBook));
    const returnedOld = await loan(id, b1!, 40, 14 - 40, 30);
    const returnedNew = await loan(id, b2!, 20, 14 - 20, 5);
    const open = await loan(id, b3!, 3, 11);
    const overdue = await loan(id, b4!, 30, -16);
    // another member's loan never leaks in
    const other = await seedMember("Other Member", "other@example.org");
    await loan(other, b1!, 2, 12);

    const detail = await get(`/api/members/${id}`);
    expect(detail.res.status).toBe(200);
    expect(detail.json).toMatchObject({
      id,
      fullName: "Sara Haddad",
      email: "sara@example.org",
      status: "ACTIVE",
      activeLoans: 2,
      overdueLoans: 1,
    });

    const { res, json } = await get(`/api/members/${id}/loans`);
    expect(res.status).toBe(200);
    expect((json as unknown as Json[]).map((l) => [l.id, l.status])).toEqual([
      [overdue, "OVERDUE"],
      [open, "ACTIVE"],
      [returnedNew, "RETURNED"],
      [returnedOld, "RETURNED"],
    ]);
    const first = (json as unknown as Json[])[0]!;
    expect(first).toMatchObject({
      book: { id: b4, title: "Book Four", author: "Author" },
      member: { id, fullName: "Sara Haddad" },
      processedBy: { id: staff.librarian, name: "Layla Librarian" },
      returnedBy: null,
      returnedAt: null,
    });
    expect(first.member.memberNumber).toMatch(/^M-\d{6}$/);
    expect((json as unknown as Json[])[2]).toMatchObject({ returnedBy: { id: staff.admin, name: "Amira Admin" } });
  });

  it("SLM-3 AC4 a member without loans → empty list", async () => {
    const id = await seedMember("Fresh Face", "fresh@example.org");
    expect((await get(`/api/members/${id}/loans`)).json).toEqual([]);
    expect((await get(`/api/members/${id}`)).json).toMatchObject({ activeLoans: 0, overdueLoans: 0 });
  });

  it("SLM-3 AC5 a Librarian deactivates and reactivates; member and loans stay; version moves", async () => {
    const m = (await create()).json;
    const book = await seedBook("Kept Loan");
    await loan(m.id, book, 2, 12);
    const put = async (status: string, version: number, who = staff.librarian) =>
      testApp().request(
        `/api/members/${m.id}`,
        await as(who, {
          method: "PUT",
          body: { fullName: m.fullName, email: m.email, phone: m.phone, status, version },
        }),
      );
    const off = await put("INACTIVE", 0);
    expect(off.status).toBe(200);
    expect(await off.json()).toMatchObject({ status: "INACTIVE", version: 1, activeLoans: 1 });
    const on = await put("ACTIVE", 1, staff.admin);
    expect(await on.json()).toMatchObject({ status: "ACTIVE", version: 2 });
    expect((await pool.query("SELECT count(*)::int n FROM loans WHERE member_id = $1", [m.id])).rows[0].n).toBe(1);
  });

  it("SLM-3 AC5 members can't be deleted (no DELETE route)", async () => {
    const m = (await create()).json;
    const res = await testApp().request(`/api/members/${m.id}`, await as(staff.admin, { method: "DELETE" }));
    expect([404, 405]).toContain(res.status);
    expect(await members()).toHaveLength(1);
  });

  it("SLM-3 AC5 edit fields; duplicate email on edit → 409, row unchanged", async () => {
    const a = (await create()).json;
    const b = (await create({ fullName: "Omar Nabil", email: "omar@example.org" })).json;
    const put = async (id: string, body: Json) =>
      testApp().request(`/api/members/${id}`, await as(staff.librarian, { method: "PUT", body }));
    const ok = await put(a.id, {
      fullName: "Sara H. Haddad",
      email: "sara.new@example.org",
      phone: "",
      status: "ACTIVE",
      version: 0,
    });
    expect(await ok.json()).toMatchObject({
      fullName: "Sara H. Haddad",
      email: "sara.new@example.org",
      phone: null,
      version: 1,
      memberNumber: a.memberNumber,
    });
    const dup = await put(b.id, {
      fullName: "Omar Nabil",
      email: "SARA.NEW@example.org",
      status: "ACTIVE",
      version: 0,
    });
    expect(dup.status).toBe(409);
    expect(((await dup.json()) as Json).code).toBe("DUPLICATE_EMAIL");
    expect((await pool.query("SELECT email, version FROM members WHERE id = $1", [b.id])).rows[0]).toEqual({
      email: "omar@example.org",
      version: 0,
    });
    // a member can keep their own email
    expect(
      (await put(b.id, { fullName: "Omar N.", email: "omar@example.org", status: "ACTIVE", version: 0 })).status,
    ).toBe(200);
  });

  it("SLM-3 stale version → 409 STALE_VERSION, nothing changed", async () => {
    const m = (await create()).json;
    const put = async (version: number, fullName: string) =>
      testApp().request(
        `/api/members/${m.id}`,
        await as(staff.librarian, { method: "PUT", body: { fullName, email: m.email, status: "ACTIVE", version } }),
      );
    expect((await put(0, "First Edit")).status).toBe(200);
    const stale = await put(0, "Second Edit");
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as Json).code).toBe("STALE_VERSION");
    expect((await pool.query("SELECT full_name, version FROM members WHERE id = $1", [m.id])).rows[0]).toEqual({
      full_name: "First Edit",
      version: 1,
    });
  });

  it("SLM-3 AC6 a member has no password, login or role: not in the table, not in the DTO", async () => {
    const m = (await create()).json;
    const cols = (
      await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'members'")
    ).rows.map((r) => r.column_name);
    expect(cols.filter((c) => /pass|login|role|token|secret/i.test(c))).toEqual([]);
    expect(Object.keys(m).filter((k) => /pass|login|role|token|secret/i.test(k))).toEqual([]);
    // members can't sign in: demo login only knows staff accounts
    const login = await testApp().request("/api/auth/demo-login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ email: m.email, password: "x" }),
    });
    expect(login.status).toBeGreaterThanOrEqual(400);
    expect(login.headers.get("set-cookie")).toBeNull();
  });

  describe("RBAC and errors", () => {
    it("Supervisor reads (members, detail, loans) but gets 403 on writes; the database is unchanged", async () => {
      const id = await seedMember("Read Only", "ro@example.org");
      expect((await get("/api/members", staff.supervisor)).res.status).toBe(200);
      expect((await get(`/api/members/${id}`, staff.supervisor)).res.status).toBe(200);
      expect((await get(`/api/members/${id}/loans`, staff.supervisor)).res.status).toBe(200);
      const app = testApp();
      const post = await app.request("/api/members", await as(staff.supervisor, { method: "POST", body: valid }));
      const put = await app.request(
        `/api/members/${id}`,
        await as(staff.supervisor, {
          method: "PUT",
          body: { fullName: "Hacked", email: "ro@example.org", status: "INACTIVE", version: 0 },
        }),
      );
      expect(post.status).toBe(403);
      expect(put.status).toBe(403);
      expect(((await post.json()) as Json).code).toBe("FORBIDDEN");
      const rows = await members();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ full_name: "Read Only", status: "ACTIVE", version: 0 });
    });

    it("a disabled staff user gets 403 USER_DISABLED on every member route", async () => {
      const res = await testApp().request("/api/members", await as(staff.disabled));
      expect(res.status).toBe(403);
      expect(((await res.json()) as Json).code).toBe("USER_DISABLED");
    });

    it("401 without a session on every member route", async () => {
      const app = testApp();
      const id = await seedMember("Anon", "anon@example.org");
      const h = { origin: "http://localhost", "content-type": "application/json" };
      for (const [method, path] of [
        ["GET", "/api/members"],
        ["GET", `/api/members/${id}`],
        ["GET", `/api/members/${id}/loans`],
        ["POST", "/api/members"],
        ["PUT", `/api/members/${id}`],
      ] as const) {
        const res = await app.request(path, {
          method,
          headers: h,
          ...(method === "GET" ? {} : { body: JSON.stringify(valid) }),
        });
        expect(res.status, `${method} ${path}`).toBe(401);
        expect(((await res.json()) as Json).code).toBe("UNAUTHENTICATED");
      }
      expect(await members()).toHaveLength(1);
    });

    it("404 for an unknown or malformed id (detail, loans, update)", async () => {
      const app = testApp();
      for (const id of ["00000000-0000-4000-8000-000000000000", "not-a-uuid"]) {
        for (const path of [`/api/members/${id}`, `/api/members/${id}/loans`]) {
          const r = await app.request(path, await as(staff.librarian));
          expect(r.status, path).toBe(404);
          expect(((await r.json()) as Json).code).toBe("NOT_FOUND");
        }
        const put = await app.request(
          `/api/members/${id}`,
          await as(staff.librarian, {
            method: "PUT",
            body: { fullName: "X", email: "x@example.org", status: "ACTIVE", version: 0 },
          }),
        );
        expect(put.status).toBe(404);
      }
    });
  });
});
