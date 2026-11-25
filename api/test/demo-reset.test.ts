import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { as, pool, resetDb, seedStaff, testApp } from "./support";

afterAll(() => pool.end());
let staff: Awaited<ReturnType<typeof seedStaff>>;
beforeEach(async () => {
  await resetDb();
  staff = await seedStaff();
});

const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows[0];

describe("SL-08 reset demo data (reset-keeps-inventory-valid)", () => {
  it("restores a consistent seed from a dirty state, keeps staff and sessions, restores demo accounts", async () => {
    const app = testApp();
    // dirty state: extra book, a member, edits
    await pool.query(
      "INSERT INTO books (title, author, category, total_copies, available_copies) VALUES ('Extra', 'X', 'Y', 2, 1)",
    );
    await pool.query("INSERT INTO members (full_name, email, status) VALUES ('Gone', 'gone@x.io', 'INACTIVE')");

    const res = await app.request("/api/admin/reset-demo", await as(staff.admin, { method: "POST", body: {} }));
    expect(res.status).toBe(200);

    expect((await q("SELECT count(*)::int n FROM books WHERE title = 'Extra'")).n).toBe(0);
    expect((await q("SELECT count(*)::int n FROM books")).n).toBeGreaterThanOrEqual(55);
    expect((await q("SELECT count(*)::int n FROM members")).n).toBe(25);
    expect(
      (
        await q(`SELECT count(*)::int n FROM books b WHERE available_copies < 0 OR available_copies > total_copies
      OR available_copies <> total_copies - (SELECT count(*) FROM loans l WHERE l.book_id = b.id AND l.returned_at IS NULL)`)
      ).n,
    ).toBe(0);
    expect(
      (await q("SELECT count(*)::int n FROM loans WHERE returned_at IS NULL AND due_at < now()")).n,
    ).toBeGreaterThan(0);
    expect((await q("SELECT count(*)::int n FROM staff_users WHERE is_demo")).n).toBe(2);
    // the Admin who pressed reset is still signed in
    expect((await app.request("/api/me", await as(staff.admin))).status).toBe(200);
  });

  it("is Admin only: Librarian/Supervisor 403, no session 401", async () => {
    const app = testApp();
    for (const id of [staff.librarian, staff.supervisor]) {
      const res = await app.request("/api/admin/reset-demo", await as(id, { method: "POST", body: {} }));
      expect(res.status).toBe(403);
    }
    const anon = await app.request("/api/admin/reset-demo", {
      method: "POST",
      headers: { origin: "http://localhost" },
    });
    expect(anon.status).toBe(401);
  });
});
