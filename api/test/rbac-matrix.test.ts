import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SESSION_COOKIE } from "../src/platform/security/session";
import { as, ORIGIN, pool, resetDb, seedStaff, TEST_SECRET, testApp } from "./support";

/**
 * SLM-8 release tests `rbac-matrix`, `no-auth-bypass` and `session-cookie-flags` (test-strategy §3.4).
 *
 * MATRIX is a literal copy of decisions/rbac-matrix.md (A = Admin, L = Librarian, S = Supervisor).
 * It is checked against the routes the app really registers: a route with no row, or a row with no
 * route, fails the suite, so a new endpoint can't ship without a decision on who may call it.
 */
type Who = "A" | "L" | "S";
const MATRIX: Record<string, Who[]> = {
  "GET /api/me": ["A", "L", "S"],
  "GET /api/books": ["A", "L", "S"],
  "GET /api/books/categories": ["A", "L", "S"],
  "GET /api/books/:id": ["A", "L", "S"],
  "POST /api/books": ["A", "L"],
  "PUT /api/books/:id": ["A", "L"],
  "DELETE /api/books/:id": ["A"],
  "GET /api/members": ["A", "L", "S"],
  "GET /api/members/:id": ["A", "L", "S"],
  "GET /api/members/:id/loans": ["A", "L", "S"],
  "POST /api/members": ["A", "L"],
  "PUT /api/members/:id": ["A", "L"],
  "GET /api/loans": ["A", "L", "S"],
  "GET /api/loans/:id": ["A", "L", "S"],
  "POST /api/loans/borrow": ["A", "L"],
  "POST /api/loans/:id/return": ["A", "L"],
  "GET /api/dashboard/summary": ["A", "L", "S"],
  "POST /api/ai/book-discovery": ["A", "L", "S"],
  "POST /api/admin/reset-demo": ["A"],
  "GET /api/staff-users": ["A"],
  "PUT /api/staff-users/:id": ["A"],
};
/** Reachable without a session (architecture §4). */
const PUBLIC = new Set(["GET /api/health", "POST /api/auth/demo-login", "POST /api/auth/logout"]);
const isPublic = (route: string) => PUBLIC.has(route) || route.startsWith("GET /api/auth/");

const registered = [...new Set(testApp().routes.filter((r) => r.method !== "ALL").map((r) => `${r.method} ${r.path}`))];
const protectedRoutes = registered.filter((r) => !isPublic(r));

const NO_SUCH_ID = "00000000-0000-4000-8000-000000000000";
const parts = (route: string) => {
  const [method, path] = route.split(" ") as [string, string];
  return { method, path: path.replace(/:\w+/g, NO_SUCH_ID) };
};
const bodyFor = (method: string) => (method === "GET" || method === "DELETE" ? undefined : {});

afterAll(() => pool.end());
let staff: Awaited<ReturnType<typeof seedStaff>>;
beforeAll(async () => {
  await resetDb();
  staff = await seedStaff();
});

describe("rbac-matrix", () => {
  it("every registered route has a row, and every row a route", () => {
    expect(protectedRoutes.filter((r) => !(r in MATRIX)), "routes with no RBAC row").toEqual([]);
    expect(Object.keys(MATRIX).filter((r) => !registered.includes(r)), "rows with no route").toEqual([]);
  });

  const cases = Object.entries(MATRIX).flatMap(([route, allowed]) =>
    (["A", "L", "S"] as const).map((who) => ({ route, who, allowed: allowed.includes(who) })));

  it.each(cases)("$who $route → allowed: $allowed", async ({ route, who, allowed }) => {
    const id = { A: staff.admin, L: staff.librarian, S: staff.supervisor }[who];
    const { method, path } = parts(route);
    const res = await testApp().request(path, await as(id, { method, body: bodyFor(method) }));
    if (allowed) {
      expect([401, 403], `${route} must be allowed for ${who}, got ${res.status}`).not.toContain(res.status);
    } else {
      expect(res.status).toBe(403);
      expect(((await res.json()) as { code: string }).code).toBe("FORBIDDEN");
    }
  });
});

describe("no-auth-bypass", () => {
  it.each(Object.keys(MATRIX))("%s without a session → 401", async (route) => {
    const { method, path } = parts(route);
    const init: RequestInit = { method, headers: { origin: ORIGIN, "content-type": "application/json" } };
    if (bodyFor(method)) init.body = "{}";
    const res = await testApp().request(path, init);
    expect(res.status).toBe(401);
  });

  it("GET /api/health stays public", async () => {
    expect((await testApp().request("/api/health")).status).toBe(200);
  });
});

describe("session-cookie-flags", () => {
  const sign = async (o: { sub?: string; exp?: number | string; secret?: string; alg?: "HS256" | "HS512" }) => {
    let jwt = new SignJWT({ role: "ADMIN" }).setProtectedHeader({ alg: o.alg ?? "HS256" }).setIssuedAt();
    if (o.sub) jwt = jwt.setSubject(o.sub);
    jwt = jwt.setExpirationTime(o.exp ?? "1h");
    return jwt.sign(new TextEncoder().encode(o.secret ?? TEST_SECRET));
  };
  const me = (token: string) => testApp().request("/api/me", { headers: { cookie: `${SESSION_COOKIE}=${token}` } });

  it("missing, malformed, tampered, expired, foreign-secret or wrong-alg cookies → 401", async () => {
    const good = await sign({ sub: staff.librarian });
    const [h, p, s] = good.split(".") as [string, string, string];
    const tamperedPayload = Buffer.from(JSON.stringify({ sub: staff.admin, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
    const bad = [
      "not-a-jwt",
      `${h}.${tamperedPayload}.${s}`, // payload swapped to the admin, old signature
      `${h}.${p}.${s.slice(0, -2)}xx`, // signature altered
      await sign({ sub: staff.librarian, exp: Math.floor(Date.now() / 1000) - 60 }), // expired
      await sign({ sub: staff.librarian, secret: "another-secret-0123456789abcdef-xyz" }),
      await sign({ sub: staff.librarian, alg: "HS512" }),
      await sign({}), // no subject
      `${Buffer.from('{"alg":"none"}').toString("base64url")}.${p}.`, // alg none
    ];
    expect((await testApp().request("/api/me")).status).toBe(401);
    for (const token of bad) expect((await me(token)).status, token).toBe(401);
    expect((await me(good)).status).toBe(200);
  });

  it("a validly signed cookie that claims role=ADMIN for a Supervisor is still a Supervisor", async () => {
    const token = await sign({ sub: staff.supervisor });
    const res = await me(token);
    expect(((await res.json()) as { role: string }).role).toBe("SUPERVISOR");
    const del = await testApp().request(`/api/books/${NO_SUCH_ID}`, { method: "DELETE", headers: { cookie: `${SESSION_COOKIE}=${token}`, origin: ORIGIN } });
    expect(del.status).toBe(403);
  });
});
