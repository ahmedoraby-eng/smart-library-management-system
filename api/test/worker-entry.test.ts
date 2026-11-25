import { afterAll, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import worker from "../src/worker";
import { DEMO, ORIGIN, pool, testEnv } from "./support";

afterAll(() => pool.end());

/** These tests go through the real Worker entry (module-scope app), not a test-built app instance. */
const ctx = () => ({ waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} }) as unknown as ExecutionContext;
const env = (extra: Record<string, unknown> = {}) => ({ ...testEnv, DATABASE_URL: inject("databaseUrl"), ...extra });
const login = (ip: string, password: string) =>
  new Request(`${ORIGIN}/api/auth/demo-login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, "cf-connecting-ip": ip },
    body: JSON.stringify({ email: DEMO.librarian.email, password }),
  });
const call = (req: Request, e = env()) =>
  (worker.fetch as (r: Request, e: unknown, c: ExecutionContext) => Promise<Response>)(req, e, ctx());

describe("SL-08 demo-login rate limit through the Worker entry", () => {
  it("6th attempt from one IP within a minute → 429 + Retry-After (limiter survives across requests)", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await call(login("203.0.113.7", "wrong-password-xx"))).status);
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
    const blocked = await call(login("203.0.113.7", DEMO.librarian.password));
    expect(blocked.status).toBe(429); // even the right password is refused while limited
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    // another IP is not affected
    expect((await call(login("203.0.113.8", DEMO.librarian.password))).status).toBe(200);
  });

  it("uses the Workers Rate Limiting binding when configured", async () => {
    const limit = vi.fn(async () => ({ success: false }));
    const res = await call(login("198.51.100.1", DEMO.librarian.password), env({ DEMO_LOGIN_LIMITER: { limit } }));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    expect(limit).toHaveBeenCalledWith({ key: "demo-login:198.51.100.1" });
  });

  it("closes the per-request DB connection via waitUntil", async () => {
    const c = ctx();
    const res = await (worker.fetch as (r: Request, e: unknown, c: ExecutionContext) => Promise<Response>)(
      new Request(`${ORIGIN}/api/health?deep=1`), env(), c);
    expect(await res.json()).toEqual({ status: "ok", db: "ok", vector: "off" }); // SLM-16: no embedder in this env
    expect(c.waitUntil).toHaveBeenCalledTimes(1);
  });

  it("rejects an unsafe x-request-id and generates one", async () => {
    const res = await call(new Request(`${ORIGIN}/api/health`, { headers: { "x-request-id": "bad id <script>;" + "x".repeat(80) } }));
    expect(res.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    const ok = await call(new Request(`${ORIGIN}/api/health`, { headers: { "x-request-id": "trace_123-abc" } }));
    expect(ok.headers.get("x-request-id")).toBe("trace_123-abc");
  });
});

describe("SLM-16 scheduled handlers through the Worker entry", () => {
  it("the entry module exports only the handler object (workerd refuses any other named export)", async () => {
    expect(Object.keys(await import("../src/worker"))).toEqual(["default"]);
  });

  it("the 15-minute trigger only tops up the discovery index; it never resets the demo data", async () => {
    await pool.query("TRUNCATE loans, members, books, book_chunks CASCADE");
    const r = await pool.query("INSERT INTO books (title, author, category, description, total_copies, available_copies) VALUES ('Index Me', 'A. Writer', 'Science', 'A short text about stars.', 1, 1) RETURNING id");
    const pending: Promise<unknown>[] = [];
    const c = { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException: vi.fn(), props: {} } as unknown as ExecutionContext;
    await (worker.scheduled as (ctl: unknown, e: unknown, ctx: ExecutionContext) => Promise<void>)({ cron: "*/15 * * * *", scheduledTime: Date.now() }, env({ AI_FAKE: "true" }), c);
    await Promise.all(pending);
    const books = await pool.query("SELECT id FROM books");
    expect(books.rows.map((b) => b.id)).toEqual([r.rows[0].id]); // not replaced by the seed
    expect(Number((await pool.query("SELECT count(*) FROM book_chunks WHERE book_id = $1", [r.rows[0].id])).rows[0].count)).toBe(1);
  });
});
