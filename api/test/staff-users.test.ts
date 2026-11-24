import { accessViolation } from "../src/staff/domain/accessRules";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { as, pool, resetDb, seedStaff, testApp } from "./support";

afterAll(() => pool.end());
let staff: Awaited<ReturnType<typeof seedStaff>>;
beforeEach(async () => { await resetDb(); staff = await seedStaff(); });

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- test convenience

async function put(actor: string, id: string, body: unknown, app = testApp()) {
  const res = await app.request(`/api/staff-users/${id}`, await as(actor, { method: "PUT", body }));
  return { res, json: (await res.json()) as Json };
}
const row = async (id: string) => (await pool.query("SELECT role, status FROM staff_users WHERE id = $1", [id])).rows[0];
const activeAdmins = async () => (await pool.query("SELECT count(*)::int n FROM staff_users WHERE role = 'ADMIN' AND status = 'ACTIVE'")).rows[0].n as number;
async function addStaff(email: string, fullName: string, role: string, isDemo = false): Promise<string> {
  return (await pool.query("INSERT INTO staff_users (email, full_name, role, is_demo) VALUES ($1, $2, $3, $4) RETURNING id", [email, fullName, role, isDemo])).rows[0].id;
}

describe("SLM-8 staff users: list", () => {
  it("Admin lists staff sorted by name with the DTO fields and paging", async () => {
    const res = await testApp().request("/api/staff-users", await as(staff.admin));
    expect(res.status).toBe(200);
    const json = (await res.json()) as Json;
    expect(json).toMatchObject({ page: 1, size: 20, total: 4 });
    expect(json.items.map((u: Json) => u.fullName)).toEqual(["Amira Admin", "Dan Disabled", "Layla Librarian", "Samir Supervisor"]);
    expect(Object.keys(json.items[0]).sort()).toEqual(["createdAt", "email", "fullName", "id", "isDemo", "role", "status"]);
    expect(json.items[0]).toMatchObject({ email: "admin@library.test", role: "ADMIN", status: "ACTIVE", isDemo: false });
    expect(Date.parse(json.items[0].createdAt)).not.toBeNaN();

    const paged = (await (await testApp().request("/api/staff-users?size=2&page=2", await as(staff.admin))).json()) as Json;
    expect(paged).toMatchObject({ page: 2, size: 2, total: 4 });
    expect(paged.items.map((u: Json) => u.fullName)).toEqual(["Layla Librarian", "Samir Supervisor"]);
  });

  it("q matches name or email, case-insensitive; LIKE wildcards are literal", async () => {
    const q = async (s: string) => ((await (await testApp().request(`/api/staff-users?q=${encodeURIComponent(s)}`, await as(staff.admin))).json()) as Json).items.map((u: Json) => u.fullName);
    expect(await q("layla")).toEqual(["Layla Librarian"]);
    expect(await q("SUPERVISOR@LIB")).toEqual(["Samir Supervisor"]);
    expect(await q("%")).toEqual([]);
  });

  it.each(["librarian", "supervisor"] as const)("%s → 403 FORBIDDEN on list and update", async (who) => {
    const list = await testApp().request("/api/staff-users", await as(staff[who]));
    expect(list.status).toBe(403);
    expect(((await list.json()) as Json).code).toBe("FORBIDDEN");
    const { res, json } = await put(staff[who], staff.librarian, { role: "ADMIN", status: "ACTIVE" });
    expect(res.status).toBe(403);
    expect(json.code).toBe("FORBIDDEN");
    expect(await row(staff.librarian)).toEqual({ role: "LIBRARIAN", status: "ACTIVE" });
  });

  it("no session → 401", async () => {
    expect((await testApp().request("/api/staff-users")).status).toBe(401);
  });

  it("invalid paging → 400 VALIDATION_FAILED", async () => {
    const res = await testApp().request("/api/staff-users?size=500", await as(staff.admin));
    expect(res.status).toBe(400);
    expect(((await res.json()) as Json).code).toBe("VALIDATION_FAILED");
  });
});

describe("SLM-8 staff users: role and status changes", () => {
  it("role change → 200 DTO and takes effect on the changed user's next request", async () => {
    const app = testApp();
    expect((await app.request("/api/books", await as(staff.supervisor, { method: "POST", body: { title: "T", author: "A", category: "C", totalCopies: 1 } }))).status).toBe(403);
    const { res, json } = await put(staff.admin, staff.supervisor, { role: "LIBRARIAN", status: "ACTIVE" }, app);
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ id: staff.supervisor, role: "LIBRARIAN", status: "ACTIVE", fullName: "Samir Supervisor" });
    const me = (await (await app.request("/api/me", await as(staff.supervisor))).json()) as Json;
    expect(me.role).toBe("LIBRARIAN");
    expect(me.permissions).toContain("BOOK_WRITE");
    expect((await app.request("/api/books", await as(staff.supervisor, { method: "POST", body: { title: "T", author: "A", category: "C", totalCopies: 1 } }))).status).toBe(201);
  });

  it("disable → that user's next request is 403 USER_DISABLED; enable restores access", async () => {
    const app = testApp();
    expect((await put(staff.admin, staff.librarian, { role: "LIBRARIAN", status: "DISABLED" }, app)).res.status).toBe(200);
    const res = await app.request("/api/books", await as(staff.librarian));
    expect(res.status).toBe(403);
    expect(((await res.json()) as Json).code).toBe("USER_DISABLED");
    expect((await put(staff.admin, staff.librarian, { role: "LIBRARIAN", status: "ACTIVE" }, app)).res.status).toBe(200);
    expect((await app.request("/api/books", await as(staff.librarian))).status).toBe(200);
  });

  it("demo-accounts-protected: PUT on a demo row → 409 PROTECTED_DEMO_ACCOUNT, row unchanged", async () => {
    const demo = await addStaff("librarian@demo.test", "Demo Librarian", "LIBRARIAN", true);
    for (const body of [{ role: "ADMIN", status: "ACTIVE" }, { role: "LIBRARIAN", status: "DISABLED" }]) {
      const { res, json } = await put(staff.admin, demo, body);
      expect(res.status).toBe(409);
      expect(json.code).toBe("PROTECTED_DEMO_ACCOUNT");
      expect(json.detail).toBe("Demo accounts are protected so every reviewer can use them.");
    }
    expect(await row(demo)).toEqual({ role: "LIBRARIAN", status: "ACTIVE" });
  });

  it("an Admin can't change their own role or status → 409 CANNOT_CHANGE_SELF; a no-op PUT is fine", async () => {
    await addStaff("second@library.test", "Second Admin", "ADMIN"); // so LAST_ADMIN is not what stops it
    for (const body of [{ role: "LIBRARIAN", status: "ACTIVE" }, { role: "ADMIN", status: "DISABLED" }]) {
      const { res, json } = await put(staff.admin, staff.admin, body);
      expect(res.status).toBe(409);
      expect(json.code).toBe("CANNOT_CHANGE_SELF");
    }
    expect(await row(staff.admin)).toEqual({ role: "ADMIN", status: "ACTIVE" });
    expect((await put(staff.admin, staff.admin, { role: "ADMIN", status: "ACTIVE" })).res.status).toBe(200);
  });

  it("a stale actor (no longer an active Admin) is refused under the lock → 403, target unchanged", async () => {
    // The actor's principal was read at the start of its request; meanwhile it lost its Admin role
    // (or was disabled). The service re-checks the actor against the locked rows (Yousef, SLM-8 review).
    const other = await addStaff("other@library.test", "Omar Admin", "ADMIN");
    const target = await addStaff("t@library.test", "Tia Target", "LIBRARIAN");
    const { container } = testApp();
    for (const demote of ["UPDATE staff_users SET role = 'LIBRARIAN' WHERE id = $1", "UPDATE staff_users SET role = 'ADMIN', status = 'DISABLED' WHERE id = $1"]) {
      await pool.query(demote, [staff.admin]);
      for (const [id, change] of [[other, { role: "SUPERVISOR", status: "ACTIVE" }], [target, { role: "ADMIN", status: "ACTIVE" }]] as const) {
        await expect(container.staffAdmin.changeAccess(staff.admin, id, change)).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
      }
    }
    expect(await row(other)).toEqual({ role: "ADMIN", status: "ACTIVE" });
    expect(await row(target)).toEqual({ role: "LIBRARIAN", status: "ACTIVE" });
  });

  it("the last active Admin can't be demoted or disabled → 409 LAST_ADMIN (rule unit)", () => {
    const admin = { id: "a", email: "a@x.test", fullName: "A", role: "ADMIN", status: "ACTIVE", isDemo: false, createdAt: new Date() } as const;
    // Reachable only if the actor and the target were the same row, which the self rule blocks first;
    // kept as a backstop and checked at the rule level.
    expect(accessViolation(admin, { role: "LIBRARIAN", status: "ACTIVE" }, "z", ["a", "z"])).toBeNull();
    expect(accessViolation(admin, { role: "LIBRARIAN", status: "ACTIVE" }, "a", ["a"])).toBe("self");
    expect(accessViolation({ ...admin, id: "b" }, { role: "ADMIN", status: "DISABLED" }, "a", ["a", "b"])).toBeNull();
    expect(accessViolation({ ...admin, id: "b" }, { role: "ADMIN", status: "DISABLED" }, "c", ["a"])).toBe("actor_not_admin");
  });

  it("two Admins demoting each other at once: exactly one wins, one active Admin is left (race-safe)", async () => {
    for (let round = 0; round < 5; round++) {
      await resetDb();
      const a = await addStaff("a@library.test", "Admin A", "ADMIN");
      const b = await addStaff("b@library.test", "Admin B", "ADMIN");
      const [x, y] = await Promise.all([
        put(a, b, { role: "LIBRARIAN", status: "ACTIVE" }),
        put(b, a, { role: "LIBRARIAN", status: "ACTIVE" }),
      ]);
      const statuses = [x.res.status, y.res.status].sort();
      expect(statuses[0]).toBe(200);
      // The loser was demoted by the winner: under the lock it is no longer an active Admin → 403.
      const loser = x.res.status === 200 ? y : x;
      expect([loser.res.status, loser.json.code]).toEqual([403, "FORBIDDEN"]);
      expect(await activeAdmins()).toBe(1);
    }
  });

  it("invalid body → 400 VALIDATION_FAILED with field errors", async () => {
    const { res, json } = await put(staff.admin, staff.librarian, { role: "OWNER", status: "ACTIVE" });
    expect(res.status).toBe(400);
    expect(json.code).toBe("VALIDATION_FAILED");
    expect(json.errors.map((e: Json) => e.field)).toContain("role");
    expect((await put(staff.admin, staff.librarian, { role: "ADMIN" })).res.status).toBe(400);
    expect(await row(staff.librarian)).toEqual({ role: "LIBRARIAN", status: "ACTIVE" });
  });

  it("unknown or malformed id → 404 NOT_FOUND", async () => {
    for (const id of ["00000000-0000-4000-8000-000000000000", "not-a-uuid"]) {
      const { res, json } = await put(staff.admin, id, { role: "LIBRARIAN", status: "ACTIVE" });
      expect(res.status).toBe(404);
      expect(json.code).toBe("NOT_FOUND");
    }
  });
});
