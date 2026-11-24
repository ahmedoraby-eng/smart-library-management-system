import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ROLE_PERMISSIONS } from "@slm/contracts";
import { loadConfig } from "../src/platform/config";
import { as, cookieFor, DEMO, pool, post, resetDb, seedStaff, sessionCookieFrom, testApp, testEnv } from "./support";

afterAll(() => pool.end());
let staff: Awaited<ReturnType<typeof seedStaff>>;
beforeEach(async () => { await resetDb(); staff = await seedStaff(); });

describe("SL-06 health and errors", () => {
  it("GET /api/health is public and needs no DB", async () => {
    const res = await testApp().request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("GET /api/health?deep=1 checks the database", async () => {
    const res = await testApp().request("/api/health?deep=1");
    expect(await res.json()).toEqual({ status: "ok", db: "ok" });
  });

  it("SL-06 AC3 unknown endpoints return Problem Details with a request id", async () => {
    const res = await testApp().request("/api/nope", await as(staff.librarian));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ status: 404, code: "NOT_FOUND", title: "Not found" });
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });
});

describe("SL-08 session (no-auth-bypass)", () => {
  it("401 without a session", async () => {
    const res = await testApp().request("/api/me");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("no header or flag signs anyone in (no bypass)", async () => {
    const res = await testApp().request("/api/me", { headers: { "x-dev-user": "librarian@library.test", "cf-access-jwt-assertion": "x" } });
    expect(res.status).toBe(401);
  });

  it("a cookie signed with another secret is rejected", async () => {
    const res = await testApp().request("/api/me", { headers: { cookie: await cookieFor(staff.admin, "another-secret-another-secret-0000") } });
    expect(res.status).toBe(401);
  });

  it("role and permissions come from the database on every request", async () => {
    const app = testApp();
    const me = (await (await app.request("/api/me", await as(staff.librarian))).json()) as { role: string; permissions: string[] };
    expect(me.role).toBe("LIBRARIAN");
    expect(me.permissions.sort()).toEqual([...ROLE_PERMISSIONS.LIBRARIAN].sort());
    await pool.query("UPDATE staff_users SET role = 'SUPERVISOR' WHERE id = $1", [staff.librarian]);
    const after = (await (await app.request("/api/me", await as(staff.librarian))).json()) as { role: string };
    expect(after.role).toBe("SUPERVISOR"); // same cookie, new role at once
  });

  it("a disabled staff user gets 403 USER_DISABLED with a valid cookie", async () => {
    const res = await testApp().request("/api/me", await as(staff.disabled));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "USER_DISABLED" });
  });

  it("writes from another origin are refused (CSRF)", async () => {
    const init = await as(staff.admin, { method: "POST", body: {} });
    (init.headers as Record<string, string>).origin = "https://evil.example";
    const res = await testApp().request("/api/admin/reset-demo", init);
    expect(res.status).toBe(403);
  });
});

describe("SL-08 demo accounts", () => {
  it("right credentials → HttpOnly session cookie and a demo Librarian", async () => {
    const app = testApp();
    const res = await app.request("/api/auth/demo-login", post(DEMO.librarian));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ role: "LIBRARIAN", isDemo: true, fullName: "Demo Librarian" });
    const setCookie = res.headers.get("set-cookie")!;
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Path=\//);
    const me = await app.request("/api/me", { headers: { cookie: sessionCookieFrom(res)! } });
    expect(await me.json()).toMatchObject({ email: DEMO.librarian.email, isDemo: true });
  });

  it("wrong password and unknown email get the same 401 INVALID_CREDENTIALS", async () => {
    const app = testApp();
    const a = await app.request("/api/auth/demo-login", post({ email: DEMO.admin.email, password: "wrong-password-x" }));
    const b = await app.request("/api/auth/demo-login", post({ email: "nobody@demo.test", password: DEMO.admin.password }));
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(await a.json()).toMatchObject({ code: "INVALID_CREDENTIALS", detail: "The email or password is not correct." });
    expect((await b.json() as { detail: string }).detail).toBe("The email or password is not correct.");
    expect(a.headers.get("set-cookie")).toBeNull();
  });

  it("6th attempt in a minute → 429 with Retry-After", async () => {
    const app = testApp();
    for (let i = 0; i < 5; i++) await app.request("/api/auth/demo-login", post({ email: "x@demo.test", password: "nope-nope-nope" }));
    const res = await app.request("/api/auth/demo-login", post(DEMO.librarian));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("disabled by config → 404", async () => {
    const res = await testApp({ env: { DEMO_ACCOUNTS_ENABLED: "false" } }).request("/api/auth/demo-login", post(DEMO.librarian));
    expect(res.status).toBe(404);
  });

  it("logout clears the cookie", async () => {
    const res = await testApp().request("/api/auth/logout", post({}));
    expect(res.status).toBe(204);
    expect(res.headers.get("set-cookie")).toMatch(/slm_session=;/);
  });
});

describe("SL-08 Google provisioning (service level)", () => {
  it("unknown Google account → read-only SUPERVISOR; bootstrap email → ADMIN", async () => {
    const { container } = testApp();
    expect((await container.staffIdentity.signInWithGoogle({ sub: "g-rita", email: "Reviewer@Gmail.com", name: "Rita Reviewer" })).role).toBe("SUPERVISOR");
    expect((await container.staffIdentity.signInWithGoogle({ sub: "g-boss", email: "boss@example.org" })).role).toBe("ADMIN");
  });
});

describe("SL-06 configuration safety", () => {
  it("needs a strong session secret", () => {
    expect(() => loadConfig({ ENVIRONMENT: "production" })).toThrow(/SESSION_SECRET/);
    expect(() => loadConfig({ ENVIRONMENT: "production", SESSION_SECRET: "short" })).toThrow(/SESSION_SECRET/);
  });
  it("refuses AI_FAKE in production", () => {
    expect(() => loadConfig({ ...testEnv, ENVIRONMENT: "production", AI_FAKE: "true" })).toThrow(/AI_FAKE/);
  });
  it("demo accounts need emails and strong passwords", () => {
    expect(() => loadConfig({ ...testEnv, DEMO_ADMIN_PASSWORD: "short" })).toThrow(/DEMO_ADMIN_PASSWORD/);
    expect(() => loadConfig({ ...testEnv, DEMO_LIBRARIAN_EMAIL: "" })).toThrow(/DEMO_LIBRARIAN/);
  });
  it("defaults loan days and limit", () => {
    const c = loadConfig(testEnv);
    expect([c.loanDays, c.maxActiveLoans]).toEqual([14, 5]);
  });
});


describe("SL-08 CSRF details", () => {
  it("a same-origin POST without a body is allowed; a non-JSON body is refused", async () => {
    const app = testApp();
    const cookie = (await as(staff.admin)).headers as Record<string, string>;
    const noBody = await app.request("/api/auth/logout", { method: "POST", headers: { origin: "http://localhost", cookie: cookie.cookie! } });
    expect(noBody.status).toBe(204);
    const form = await app.request("/api/auth/logout", {
      method: "POST", headers: { origin: "http://localhost", "content-type": "application/x-www-form-urlencoded", "content-length": "3" }, body: "a=b",
    });
    expect(form.status).toBe(403);
  });
});
