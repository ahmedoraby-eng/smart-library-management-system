import pg from "pg";
import { inject } from "vitest";
import { SignJWT } from "jose";
import { createApp } from "../src/app";
import { buildContainer } from "../src/container";
import { loadConfig, type RawEnv } from "../src/platform/config";
import type { Clock } from "../src/platform/clock";
import { createDb } from "../src/platform/db";
import { SESSION_COOKIE } from "../src/platform/security/session";

export const pool = new pg.Pool({ connectionString: inject("databaseUrl"), max: 25 });

export const ORIGIN = "http://localhost";
export const TEST_SECRET = "test-session-secret-0123456789abcdef";
export const DEMO = {
  librarian: { email: "librarian@demo.test", password: "librarian-pass-123" },
  admin: { email: "admin@demo.test", password: "admin-pass-12345" },
};

export const testEnv: RawEnv = {
  ENVIRONMENT: "test",
  SESSION_SECRET: TEST_SECRET,
  BOOTSTRAP_ADMIN_EMAILS: "boss@example.org",
  DEMO_ACCOUNTS_ENABLED: "true",
  DEMO_LIBRARIAN_EMAIL: DEMO.librarian.email,
  DEMO_LIBRARIAN_PASSWORD: DEMO.librarian.password,
  DEMO_ADMIN_EMAIL: DEMO.admin.email,
  DEMO_ADMIN_PASSWORD: DEMO.admin.password,
};

export function testApp(opts: { env?: RawEnv; clock?: Clock } = {}) {
  const config = loadConfig({ ...testEnv, ...opts.env });
  const container = buildContainer(createDb(pool), config, opts.clock ?? (() => new Date()));
  return Object.assign(createApp(() => container), { container });
}

export async function resetDb(): Promise<void> {
  await pool.query("TRUNCATE loans, members, books, staff_users RESTART IDENTITY CASCADE");
}

/** Staff fixtures (one per role + a disabled one). Returns ids by key. */
export async function seedStaff(): Promise<Record<"admin" | "librarian" | "supervisor" | "disabled", string>> {
  const r = await pool.query<{ id: string; email: string }>(`INSERT INTO staff_users (email, full_name, role, status) VALUES
    ('admin@library.test', 'Amira Admin', 'ADMIN', 'ACTIVE'),
    ('librarian@library.test', 'Layla Librarian', 'LIBRARIAN', 'ACTIVE'),
    ('supervisor@library.test', 'Samir Supervisor', 'SUPERVISOR', 'ACTIVE'),
    ('disabled@library.test', 'Dan Disabled', 'LIBRARIAN', 'DISABLED') RETURNING id, email`);
  const by = (e: string) => r.rows.find((x) => x.email.startsWith(e))!.id;
  return { admin: by("admin"), librarian: by("librarian"), supervisor: by("supervisor"), disabled: by("disabled") };
}

/** Test helper (not an app feature): a session cookie signed with the test secret, as after a real sign-in. */
export async function cookieFor(staffId: string, secret = TEST_SECRET): Promise<string> {
  const jwt = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(staffId)
    .setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(secret));
  return `${SESSION_COOKIE}=${jwt}`;
}

/** Request init for a signed-in call; writes get our Origin and a JSON body. */
export async function as(staffId: string, init: { method?: string; body?: unknown } = {}): Promise<RequestInit> {
  const headers: Record<string, string> = { cookie: await cookieFor(staffId), origin: ORIGIN };
  const out: RequestInit = { method: init.method ?? "GET", headers };
  if (init.body !== undefined) {
    headers["content-type"] = "application/json";
    out.body = JSON.stringify(init.body);
  }
  return out;
}

export const post = (body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
  body: JSON.stringify(body),
});

export function sessionCookieFrom(res: Response): string | null {
  const set = res.headers.get("set-cookie");
  const m = set?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return m ? `${SESSION_COOKIE}=${m[1]}` : null;
}
