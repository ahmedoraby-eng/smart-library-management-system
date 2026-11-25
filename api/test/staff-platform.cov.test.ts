import { sql } from "drizzle-orm";
import pg from "pg";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import { createDb, inRawTransaction, PgCode, pgError } from "../src/platform/db";
import { AppError } from "../src/platform/errors";
import { StaffAdminService } from "../src/staff/application/StaffAdminService";
import type { StaffAccessStore, StaffUser } from "../src/staff/domain/StaffUser";
import { PgStaffUserRepository } from "../src/staff/infrastructure/PgStaffUserRepository";
import { pool, resetDb } from "./support";

afterAll(() => pool.end());
beforeEach(resetDb);

const db = () => createDb(pool);
const cacheCount = async () => Number((await pool.query("SELECT count(*) FROM ai_cache")).rows[0].count);
const insertCache = (key: string) => `INSERT INTO ai_cache (key, value, expires_at) VALUES ('${key}', '{}', now())`;

describe("pgError", () => {
  it("reads SQLSTATE and constraint from the error itself, or from a wrapped cause (Drizzle wraps driver errors)", () => {
    expect(pgError({ code: "23505", constraint: "uq" })).toEqual({ code: "23505", constraint: "uq" });
    expect(pgError({ code: "23514" })).toEqual({ code: "23514" });
    expect(pgError({ code: "23505", constraint: 7 })).toEqual({ code: "23505" }); // a non-string constraint is dropped
    expect(pgError(new Error("wrap", { cause: { code: "23503", constraint: "fk" } }))).toEqual({
      code: "23503",
      constraint: "fk",
    });
    const deep = { cause: { cause: { cause: { code: "40001" } } } };
    expect(pgError(deep)).toEqual({ code: "40001" });
  });

  it("returns null for anything else: non-pg codes, wrong length or case, no code, too-deep chains, null and primitives", () => {
    for (const e of [
      null,
      undefined,
      "boom",
      42,
      {},
      new Error("x"),
      { code: "ENOENT" },
      { code: "2350" },
      { code: "23505x" },
      { code: "2b505" },
      { code: 23505 },
    ]) {
      expect(pgError(e)).toBeNull();
    }
    expect(pgError({ cause: { cause: { cause: { cause: { code: "23505" } } } } })).toBeNull(); // fifth level: not followed
    expect(PgCode).toEqual({ uniqueViolation: "23505", checkViolation: "23514", foreignKeyViolation: "23503" });
  });

  it("recognises a real unique violation raised through Drizzle", async () => {
    await pool.query(insertCache("dup"));
    const err = await db()
      .execute(sql.raw(insertCache("dup")))
      .catch((e: unknown) => e);
    expect(pgError(err)).toMatchObject({ code: PgCode.uniqueViolation, constraint: "ai_cache_pkey" });
  });
});

describe("inRawTransaction", () => {
  it("on a Pool: runs the statements in one transaction and commits", async () => {
    await inRawTransaction(db(), async (c) => {
      await c.query(insertCache("a"));
      await c.query(insertCache("b"));
    });
    expect(await cacheCount()).toBe(2);
  });

  it("on a Pool: an error rolls everything back and is rethrown; the connection goes back to the pool", async () => {
    await expect(
      inRawTransaction(db(), async (c) => {
        await c.query(insertCache("gone"));
        throw new Error("seed failed");
      }),
    ).rejects.toThrow("seed failed");
    expect(await cacheCount()).toBe(0);
    const before = pool.idleCount + pool.waitingCount;
    await expect(
      inRawTransaction(db(), async (c) => {
        await c.query("SELECT 1/0");
      }),
    ).rejects.toThrow(/division by zero/);
    expect(pool.waitingCount).toBe(0);
    expect(pool.idleCount + pool.waitingCount).toBeGreaterThanOrEqual(before);
  });

  it("on a single Client (the Worker): commits, rolls back, and never releases or ends the client", async () => {
    const client = new pg.Client({ connectionString: inject("databaseUrl") });
    await client.connect();
    try {
      const cdb = createDb(client);
      await inRawTransaction(cdb, async (c) => {
        await c.query(insertCache("c1"));
      });
      expect(await cacheCount()).toBe(1);
      await expect(
        inRawTransaction(cdb, async (c) => {
          await c.query(insertCache("c2"));
          throw new Error("nope");
        }),
      ).rejects.toThrow("nope");
      expect(await cacheCount()).toBe(1);
      // the client is still usable afterwards
      expect((await client.query("SELECT 1 AS one")).rows[0].one).toBe(1);
    } finally {
      await client.end();
    }
  });

  it("a failing ROLLBACK is swallowed: the caller sees the original error, and the connection is still released", async () => {
    const release = vi.fn();
    const query = vi.fn(async (text: string) => {
      if (text === "ROLLBACK") throw new Error("connection lost");
    });
    const fake = { $client: { totalCount: 1, connect: async () => ({ query, release }) } } as unknown as Parameters<
      typeof inRawTransaction
    >[0];
    await expect(
      inRawTransaction(fake, async () => {
        throw new Error("original");
      }),
    ).rejects.toThrow("original");
    expect(query.mock.calls.map((c) => c[0])).toEqual(["BEGIN", "ROLLBACK"]);
    expect(release).toHaveBeenCalledTimes(1);
  });
});

describe("PgStaffUserRepository", () => {
  const repo = () => new PgStaffUserRepository(db());
  const add = async (email: string, name: string, role = "LIBRARIAN", status = "ACTIVE") =>
    (
      await pool.query("INSERT INTO staff_users (email, full_name, role, status) VALUES ($1,$2,$3,$4) RETURNING id", [
        email,
        name,
        role,
        status,
      ])
    ).rows[0].id as string;

  it("findByEmail is case-insensitive; findById ignores ids that are not uuid-shaped and unknown ids", async () => {
    const id = await add("Mixed.Case@Library.Test", "Mixed");
    expect((await repo().findByEmail("mixed.case@library.test"))?.id).toBe(id);
    expect(await repo().findByEmail("nobody@library.test")).toBeNull();
    expect((await repo().findById(id))?.fullName).toBe("Mixed");
    expect(await repo().findById("not-a-uuid")).toBeNull();
    expect(await repo().findById("'; DROP TABLE staff_users; --")).toBeNull();
    expect(await repo().findById("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("Google subject: lookup, and binding works once only (never rebinds an account to another Google identity)", async () => {
    const id = await add("g@library.test", "Gee");
    expect(await repo().findByGoogleSub("sub-1")).toBeNull();
    expect(await repo().bindGoogleSub(id, "sub-1")).toBe(true);
    expect(await repo().bindGoogleSub(id, "sub-2")).toBe(false);
    expect((await repo().findByGoogleSub("sub-1"))?.id).toBe(id);
    expect(await repo().findByGoogleSub("sub-2")).toBeNull();
    expect(await repo().bindGoogleSub("00000000-0000-0000-0000-000000000000", "sub-3")).toBe(false);
  });

  it("provision inserts a new row (email lower-cased) and returns the existing row untouched when the email is taken", async () => {
    const created = await repo().provision({
      email: "New.Person@Library.Test",
      fullName: "New Person",
      role: "LIBRARIAN",
      googleSub: "g-new",
    });
    expect(created).toMatchObject({
      email: "new.person@library.test",
      fullName: "New Person",
      role: "LIBRARIAN",
      status: "ACTIVE",
      isDemo: false,
      googleSub: "g-new",
    });
    const again = await repo().provision({
      email: "NEW.PERSON@library.test",
      fullName: "Someone Else",
      role: "ADMIN",
      googleSub: "g-other",
    });
    expect(again.id).toBe(created.id);
    expect(again).toMatchObject({ fullName: "New Person", role: "LIBRARIAN", googleSub: "g-new" }); // no privilege change through a second sign-in
  });

  it("upsertDemo creates a demo account, and restores a changed or disabled one (role, ACTIVE, demo flag)", async () => {
    const first = await repo().upsertDemo({ email: "Demo@Library.Test", fullName: "Demo One", role: "LIBRARIAN" });
    expect(first).toMatchObject({ email: "demo@library.test", isDemo: true, status: "ACTIVE", role: "LIBRARIAN" });
    await pool.query("UPDATE staff_users SET status = 'DISABLED', role = 'SUPERVISOR', is_demo = false WHERE id = $1", [
      first.id,
    ]);
    const restored = await repo().upsertDemo({ email: "demo@library.test", fullName: "Demo Renamed", role: "ADMIN" });
    expect(restored).toMatchObject({
      id: first.id,
      fullName: "Demo Renamed",
      role: "ADMIN",
      status: "ACTIVE",
      isDemo: true,
    });
  });

  it("list is ordered by name; update changes role and status, and returns null for an unknown id", async () => {
    const b = await add("b@library.test", "Bella");
    await add("a@library.test", "Adam");
    expect((await repo().list()).map((u) => u.fullName)).toEqual(["Adam", "Bella"]);
    const updated = await repo().update(b, { role: "SUPERVISOR", status: "DISABLED" });
    expect(updated).toMatchObject({ role: "SUPERVISOR", status: "DISABLED" });
    expect(await repo().update("00000000-0000-0000-0000-000000000000", { role: "ADMIN", status: "ACTIVE" })).toBeNull();
  });

  it("search: no filter, by name or email (case-insensitive), LIKE wildcards are literal, paging and total", async () => {
    for (const [e, n] of [
      ["a1@x.test", "Alice 100%"],
      ["a2@x.test", "Alice 100x"],
      ["u_s@x.test", "Under_score"],
      ["us@x.test", "Underscore"],
      ["z@other.test", "Zed"],
    ])
      await add(e!, n!);
    const all = await repo().search({ page: 1, size: 50 });
    expect(all.total).toBe(5);
    expect(all.items.map((u) => u.fullName)).toEqual(["Alice 100%", "Alice 100x", "Under_score", "Underscore", "Zed"]);
    expect((await repo().search({ q: "ALICE", page: 1, size: 50 })).total).toBe(2);
    expect((await repo().search({ q: "other.test", page: 1, size: 50 })).items.map((u) => u.fullName)).toEqual(["Zed"]);
    expect((await repo().search({ q: "100%", page: 1, size: 50 })).items.map((u) => u.fullName)).toEqual([
      "Alice 100%",
    ]); // % is not a wildcard
    expect((await repo().search({ q: "r_s", page: 1, size: 50 })).items.map((u) => u.fullName)).toEqual([
      "Under_score",
    ]); // _ is not a wildcard
    expect((await repo().search({ q: "\\", page: 1, size: 50 })).total).toBe(0);
    const page2 = await repo().search({ page: 2, size: 2 });
    expect(page2.items.map((u) => u.fullName)).toEqual(["Under_score", "Underscore"]);
    expect(page2.total).toBe(5);
    expect((await repo().search({ page: 9, size: 2 })).items).toEqual([]);
  });

  it("changeAccess: unknown or malformed ids → null, nothing locked or changed", async () => {
    const decide = vi.fn(() => null);
    expect(await repo().changeAccess("nope", { role: "ADMIN", status: "ACTIVE" }, decide)).toBeNull();
    expect(
      await repo().changeAccess("00000000-0000-0000-0000-000000000000", { role: "ADMIN", status: "ACTIVE" }, decide),
    ).toBeNull();
    expect(decide).not.toHaveBeenCalled();
  });

  it("changeAccess: decide sees the locked target and every ACTIVE admin; a reason refuses and leaves the row alone; null applies", async () => {
    const admin = await add("adm@library.test", "Admin", "ADMIN");
    await add("dis@library.test", "Disabled Admin", "ADMIN", "DISABLED");
    const lib = await add("lib@library.test", "Lib");
    const seen: Array<{ target: StaffUser; admins: string[] }> = [];
    const refused = await repo().changeAccess(lib, { role: "SUPERVISOR", status: "ACTIVE" }, (target, admins) => {
      seen.push({ target, admins });
      return "no" as const;
    });
    expect(refused).toEqual({ kind: "refused", reason: "no" });
    expect(seen[0]!.target.id).toBe(lib);
    expect(seen[0]!.admins).toEqual([admin]); // the disabled admin is not counted
    expect((await repo().findById(lib))?.role).toBe("LIBRARIAN");
    const ok = await repo().changeAccess(lib, { role: "SUPERVISOR", status: "DISABLED" }, () => null);
    expect(ok).toMatchObject({ kind: "ok", user: { id: lib, role: "SUPERVISOR", status: "DISABLED" } });
    expect(await repo().findById(lib)).toMatchObject({ role: "SUPERVISOR", status: "DISABLED" });
  });
});

describe("StaffAdminService (store faked)", () => {
  const user: StaffUser = {
    id: "u1",
    email: "u@x.test",
    fullName: "U",
    role: "LIBRARIAN",
    status: "ACTIVE",
    isDemo: false,
    createdAt: new Date(0),
  };
  const storeReturning = (result: Awaited<ReturnType<StaffAccessStore["changeAccess"]>>): StaffAccessStore => ({
    search: async () => ({ items: [], total: 0 }),
    changeAccess: (async () => result) as StaffAccessStore["changeAccess"],
  });

  it("list passes q only when given, and echoes the paging", async () => {
    const search = vi.fn(async () => ({ items: [user], total: 1 }));
    const svc = new StaffAdminService({ search, changeAccess: vi.fn() });
    expect(await svc.list({ page: 2, size: 10 } as never)).toEqual({ items: [user], total: 1, page: 2, size: 10 });
    expect(search).toHaveBeenLastCalledWith({ page: 2, size: 10 });
    await svc.list({ q: "ann", page: 1, size: 20 } as never);
    expect(search).toHaveBeenLastCalledWith({ q: "ann", page: 1, size: 20 });
    await svc.list({ q: "", page: 1, size: 20 } as never); // an empty search is no search
    expect(search).toHaveBeenLastCalledWith({ page: 1, size: 20 });
  });

  it("changeAccess: returns the updated user; an unknown id is 404", async () => {
    expect(
      await new StaffAdminService(storeReturning({ kind: "ok", user })).changeAccess("a", "u1", {
        role: "LIBRARIAN",
        status: "ACTIVE",
      }),
    ).toBe(user);
    const err = await new StaffAdminService(storeReturning(null))
      .changeAccess("a", "u1", { role: "LIBRARIAN", status: "ACTIVE" })
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  it("changeAccess: every refusal reason maps to its own status, code and sentence", async () => {
    const expected = {
      actor_not_admin: [403, "FORBIDDEN", "You are no longer an active Admin."],
      protected_demo: [409, "PROTECTED_DEMO_ACCOUNT", "Demo accounts are protected so every reviewer can use them."],
      self: [409, "CANNOT_CHANGE_SELF", "You can't change your own role or status."],
      last_admin: [409, "LAST_ADMIN", "This is the last active Admin. Make someone else an Admin first."],
    } as const;
    for (const [reason, [status, code, detail]] of Object.entries(expected)) {
      const err = await new StaffAdminService(storeReturning({ kind: "refused", reason: reason as never }))
        .changeAccess("a", "u1", { role: "LIBRARIAN", status: "ACTIVE" })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AppError);
      expect(err).toMatchObject({ status, code, message: detail });
    }
  });

  it("changeAccess hands the store a decision function that applies the access rules for this actor", async () => {
    let decision: unknown;
    const store: StaffAccessStore = {
      search: async () => ({ items: [], total: 0 }),
      changeAccess: (async (_id: string, _c: unknown, decide: (t: StaffUser, a: string[]) => unknown) => {
        decision = [decide({ ...user, isDemo: true }, ["actor"]), decide(user, ["someone"]), decide(user, ["actor"])];
        return { kind: "ok", user };
      }) as StaffAccessStore["changeAccess"],
    };
    await new StaffAdminService(store).changeAccess("actor", "u1", { role: "SUPERVISOR", status: "ACTIVE" });
    expect(decision).toEqual(["protected_demo", "actor_not_admin", null]);
  });
});
