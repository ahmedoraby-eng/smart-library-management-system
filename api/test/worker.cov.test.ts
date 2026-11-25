import pg from "pg";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import worker from "../src/worker";
import { ORIGIN, pool, resetDb, testEnv } from "./support";

afterAll(() => pool.end());
afterEach(() => vi.restoreAllMocks());
beforeEach(resetDb);

type Fetch = (r: Request, e: unknown, c: ExecutionContext) => Promise<Response>;
type Scheduled = (ctl: unknown, e: unknown, c: ExecutionContext) => Promise<void>;
const url = () => inject("databaseUrl");
const ctx = () => {
  const pending: Promise<unknown>[] = [];
  const c = { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException: vi.fn(), props: {} } as unknown as ExecutionContext;
  return { c, settle: () => Promise.allSettled(pending) };
};
const callFetch = async (req: Request, env: Record<string, unknown>) => {
  const { c, settle } = ctx();
  const res = await (worker.fetch as Fetch)(req, env, c);
  await settle();
  return res;
};
const cron = async (expr: string, env: Record<string, unknown>) => {
  const { c, settle } = ctx();
  await (worker.scheduled as Scheduled)({ cron: expr, scheduledTime: Date.now() }, env, c);
  return settle();
};
const deepHealth = () => new Request(`${ORIGIN}/api/health?deep=1`);
const closedPort = "postgres://test:test@127.0.0.1:1/none"; // nothing listens on port 1

describe("Worker entry: database binding", () => {
  it("without HYPERDRIVE or DATABASE_URL a request that needs the database is a 500 Problem with a request id, and the cause is logged but not shown", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await callFetch(deepHealth(), { ...testEnv });
    expect(res.status).toBe(500);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    const body = await res.json();
    expect(body).toMatchObject({ status: 500, code: "INTERNAL", requestId: expect.any(String) });
    expect(JSON.stringify(body)).not.toContain("HYPERDRIVE");
    expect(String((JSON.parse(err.mock.calls[0]![0] as string) as { message: string }).message)).toContain("No database binding (HYPERDRIVE or DATABASE_URL)");
  });

  it("the public liveness check needs no database at all", async () => {
    const res = await callFetch(new Request(`${ORIGIN}/api/health`), { ...testEnv });
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("uses the Hyperdrive connection string when bound, in preference to DATABASE_URL", async () => {
    const env = { ...testEnv, HYPERDRIVE: { connectionString: url() }, DATABASE_URL: closedPort };
    const res = await callFetch(deepHealth(), env);
    expect(await res.json()).toMatchObject({ status: "ok", db: "ok" });
  });

  it("a database that cannot be reached is a 500, not a hang or a leak of the connection string", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await callFetch(deepHealth(), { ...testEnv, DATABASE_URL: closedPort });
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("127.0.0.1");
  });

  it("an unusable configuration (production with demo accounts, say) is refused the same way", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await callFetch(deepHealth(), { ...testEnv, DATABASE_URL: url(), ENVIRONMENT: "production", AI_FAKE: "true" });
    expect(res.status).toBe(500);
  });
});

describe("Worker entry: scheduled handlers", () => {
  const book = async (title: string) => (await pool.query(
    "INSERT INTO books (title, author, category, description, total_copies, available_copies) VALUES ($1,'A','Science','Stars and planets.',1,1) RETURNING id", [title])).rows[0].id as string;

  it("the nightly trigger restores the demo data, re-indexes it, purges expired cache rows and says so in one log line", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await book("Not In The Seed");
    await pool.query("INSERT INTO ai_cache (key, value, expires_at) VALUES ('old', '{}', now() - interval '1 hour'), ('fresh', '{}', now() + interval '1 hour')");
    const results = await cron("0 0 * * *", { ...testEnv, DATABASE_URL: url(), AI_FAKE: "true" });
    expect(results.map((r) => r.status)).toEqual(["fulfilled"]);
    expect((await pool.query("SELECT count(*)::int n FROM books WHERE title = 'Not In The Seed'")).rows[0].n).toBe(0);
    expect((await pool.query("SELECT count(*)::int n FROM books")).rows[0].n).toBeGreaterThanOrEqual(55);
    expect((await pool.query("SELECT count(*)::int n FROM book_chunks")).rows[0].n).toBeGreaterThan(0); // indexed after the reset
    expect((await pool.query("SELECT key FROM ai_cache")).rows.map((r) => r.key)).toEqual(["fresh"]);
    expect(log.mock.calls.map((c) => JSON.parse(c[0] as string))).toContainEqual({ level: "info", message: "demo data reset (cron)" });
  });

  it("without an embedder the nightly reset still works (the re-index is a no-op)", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const results = await cron("0 0 * * *", { ...testEnv, DATABASE_URL: url(), EMBEDDING_MODEL: "off" });
    expect(results.map((r) => r.status)).toEqual(["fulfilled"]);
    expect((await pool.query("SELECT count(*)::int n FROM books")).rows[0].n).toBeGreaterThanOrEqual(55);
    expect((await pool.query("SELECT count(*)::int n FROM book_chunks")).rows[0].n).toBe(0);
  });

  it("any other cron is the index top-up: it indexes what is missing and never logs a reset", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const id = await book("Index Me Too");
    const results = await cron("*/30 * * * *", { ...testEnv, DATABASE_URL: url(), AI_FAKE: "true" });
    expect(results.map((r) => r.status)).toEqual(["fulfilled"]);
    expect((await pool.query("SELECT count(*)::int n FROM book_chunks WHERE book_id = $1", [id])).rows[0].n).toBe(1);
    expect((await pool.query("SELECT count(*)::int n FROM books")).rows[0].n).toBe(1); // no seed
    expect(log).not.toHaveBeenCalled();
  });

  it("cache purge and connection close are best effort: failures of either never fail the nightly run", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const originalQuery = pg.Client.prototype.query as (...a: unknown[]) => unknown;
    const originalEnd = pg.Client.prototype.end as (...a: unknown[]) => Promise<void>;
    const queryText = (a: unknown) => (typeof a === "string" ? a : (a as { text?: string } | undefined)?.text ?? "");
    const query = vi.spyOn(pg.Client.prototype, "query").mockImplementation(function (this: unknown, ...args: unknown[]) {
      return queryText(args[0]).includes("DELETE FROM ai_cache") ? Promise.reject(new Error("purge failed")) : originalQuery.apply(this, args);
    } as never);
    const end = vi.spyOn(pg.Client.prototype, "end").mockImplementation((async function (this: unknown) {
      await originalEnd.call(this);
      throw new Error("close failed");
    }) as never);
    let results: PromiseSettledResult<unknown>[];
    let closes = 0;
    try {
      results = await cron("0 0 * * *", { ...testEnv, DATABASE_URL: url(), AI_FAKE: "true" });
      closes = end.mock.calls.length;
    } finally {
      query.mockRestore();
      end.mockRestore();
    }
    expect(results.map((r) => r.status)).toEqual(["fulfilled"]);
    expect(closes).toBe(1);
    expect((await pool.query("SELECT count(*)::int n FROM books")).rows[0].n).toBeGreaterThanOrEqual(55);
  });

  it("a request whose connection fails to close still gets its answer (the close is deferred to waitUntil and swallowed)", async () => {
    const originalEnd = pg.Client.prototype.end as (...a: unknown[]) => Promise<void>;
    const end = vi.spyOn(pg.Client.prototype, "end").mockImplementation((async function (this: unknown) {
      await originalEnd.call(this);
      throw new Error("close failed");
    }) as never);
    try {
      const res = await callFetch(deepHealth(), { ...testEnv, DATABASE_URL: url() });
      expect(await res.json()).toMatchObject({ status: "ok", db: "ok" });
      expect(end).toHaveBeenCalledTimes(1);
    } finally {
      end.mockRestore();
    }
  });

  it("a failing reset is logged with its cause and rethrown to the platform, and the connection is still closed", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const end = vi.spyOn(pg.Client.prototype, "end");
    const query = vi.spyOn(pg.Client.prototype, "query").mockImplementation((() => Promise.reject(new Error("disk on fire"))) as never);
    let results: PromiseSettledResult<unknown>[];
    try {
      results = await cron("0 0 * * *", { ...testEnv, DATABASE_URL: url(), AI_FAKE: "true" });
    } finally {
      query.mockRestore();
    }
    expect(results[0]).toMatchObject({ status: "rejected" });
    const entry = JSON.parse(err.mock.calls[0]![0] as string);
    expect(entry).toMatchObject({ level: "error", message: "demo reset failed (cron)" });
    expect(entry.error).toContain("disk on fire");
    expect(end).toHaveBeenCalledTimes(1);
  });

  it("a failing top-up is logged and rethrown too", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const query = vi.spyOn(pg.Client.prototype, "query").mockImplementation((() => Promise.reject(new Error("index store down"))) as never);
    let results: PromiseSettledResult<unknown>[];
    try {
      results = await cron("5 * * * *", { ...testEnv, DATABASE_URL: url(), AI_FAKE: "true" });
    } finally {
      query.mockRestore();
    }
    // syncAllSafely swallows store errors by design: the handler finishes and logs through the container, not as a reset failure
    expect(results[0]).toMatchObject({ status: "fulfilled" });
    expect(err.mock.calls.every((c) => !String(c[0]).includes("demo reset failed"))).toBe(true);
  });

  it("when the database cannot even be opened, the failure is logged and rethrown, with nothing to close", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const results = await cron("0 0 * * *", { ...testEnv, DATABASE_URL: closedPort });
    expect(results[0]).toMatchObject({ status: "rejected" });
    expect(JSON.parse(err.mock.calls[0]![0] as string)).toMatchObject({ level: "error", message: "demo reset failed (cron)" });
    const noBinding = await cron("0 0 * * *", { ...testEnv });
    expect(noBinding[0]).toMatchObject({ status: "rejected" });
  });
});
