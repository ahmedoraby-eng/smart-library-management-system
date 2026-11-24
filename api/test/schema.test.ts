import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { inject } from "vitest";
import { seed } from "../../scripts/lib/db-tools";
import { pool, resetDb, seedStaff } from "./support";

afterAll(() => pool.end());
beforeEach(async () => { await resetDb(); });

const book = (total: number, available: number) =>
  pool.query(
    "INSERT INTO books (title, author, category, total_copies, available_copies) VALUES ('T', 'A', 'C', $1, $2) RETURNING id",
    [total, available],
  );

describe("database guarantees (last line of defence)", () => {
  it("rejects available > total and negative stock", async () => {
    await expect(book(1, 2)).rejects.toMatchObject({ code: "23514" });
    await expect(book(1, -1)).rejects.toMatchObject({ code: "23514" });
    await expect(book(2, 2)).resolves.toBeTruthy();
  });

  it("allows only one open loan per member and title", async () => {
    await seedStaff();
    const b = (await book(3, 3)).rows[0].id;
    const m = (await pool.query("INSERT INTO members (full_name, email) VALUES ('M', 'm@x.io') RETURNING id")).rows[0].id;
    const s = (await pool.query("SELECT id FROM staff_users LIMIT 1")).rows[0].id;
    const loan = () => pool.query(
      "INSERT INTO loans (book_id, member_id, processed_by, due_at) VALUES ($1, $2, $3, now() + interval '14 days')", [b, m, s]);
    await loan();
    await expect(loan()).rejects.toMatchObject({ code: "23505", constraint: "loans_open_member_book_uq" });
  });

  it("generates member numbers M-000001…", async () => {
    await pool.query("ALTER SEQUENCE member_number_seq RESTART WITH 1");
    const r = await pool.query("INSERT INTO members (full_name, email) VALUES ('M', 'm2@x.io') RETURNING member_number");
    expect(r.rows[0].member_number).toBe("M-000001");
  });

  it("full-text search vector is generated and weighted", async () => {
    await pool.query("INSERT INTO books (title, author, category, description, total_copies, available_copies) VALUES ('Software Architecture Basics', 'Jane Doe', 'Tech', 'systems', 1, 1)");
    const r = await pool.query("SELECT title FROM books WHERE search @@ websearch_to_tsquery('english', 'architectures')");
    expect(r.rows).toHaveLength(1);
    const t = await pool.query("SELECT similarity(title, 'Sofware Architecure') > 0.3 AS ok FROM books");
    expect(t.rows[0].ok).toBe(true);
  });
});

describe("demo seed", () => {
  it("loads a consistent catalogue with ACTIVE, OVERDUE and RETURNED loans", async () => {
    await seedStaff();
    expect(await seed(inject("databaseUrl"), { reset: true })).toBe("seeded");
    const q = async (sql: string) => (await pool.query(sql)).rows[0];
    expect((await q("SELECT count(*)::int n FROM books")).n).toBeGreaterThanOrEqual(30);
    expect((await q("SELECT count(DISTINCT category)::int n FROM books")).n).toBeGreaterThanOrEqual(5);
    expect((await q("SELECT count(*)::int n FROM members")).n).toBeGreaterThanOrEqual(10);
    expect((await q("SELECT count(*)::int n FROM loans WHERE returned_at IS NULL AND due_at >= now()")).n).toBeGreaterThan(0);
    expect((await q("SELECT count(*)::int n FROM loans WHERE returned_at IS NULL AND due_at < now()")).n).toBeGreaterThan(0);
    expect((await q("SELECT count(*)::int n FROM loans WHERE returned_at IS NOT NULL")).n).toBeGreaterThan(0);
    // stock = total − open loans, for every book
    expect((await q(`SELECT count(*)::int n FROM books b WHERE available_copies <>
      total_copies - (SELECT count(*) FROM loans l WHERE l.book_id = b.id AND l.returned_at IS NULL)`)).n).toBe(0);
    expect(await seed(inject("databaseUrl"), { reset: false })).toBe("skipped");
  });
});
