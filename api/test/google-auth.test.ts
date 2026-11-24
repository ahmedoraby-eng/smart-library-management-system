import { exportJWK, generateKeyPair, createLocalJWKSet, SignJWT, type CryptoKey, type JWTVerifyGetKey } from "jose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/platform/config";
import { pkceChallenge } from "../src/staff/application/GoogleSignIn";
import { OidcError, type OidcIdentity, type OidcProvider } from "../src/staff/domain/OidcProvider";
import { GOOGLE_AUTHORIZE_URL, GOOGLE_TOKEN_URL, GoogleOidcProvider } from "../src/staff/infrastructure/GoogleOidcProvider";
import { DEMO, ORIGIN, pool, resetDb, seedStaff, sessionCookieFrom, testApp, testEnv } from "./support";

afterAll(() => pool.end());
beforeEach(async () => { await resetDb(); await seedStaff(); });

const CLIENT = { clientId: "test-client.apps.example", clientSecret: "test-client-secret" };
const googleEnv = { GOOGLE_CLIENT_ID: CLIENT.clientId, GOOGLE_CLIENT_SECRET: CLIENT.clientSecret };
const STATE_COOKIE = "slm_google_state";

/** Fake Google at the port: builds the real authorize URL, and returns a scripted identity from exchange. */
class FakeGoogle implements OidcProvider {
  private readonly real = new GoogleOidcProvider(CLIENT);
  calls: { code: string; verifier: string; redirectUri: string }[] = [];
  /** null → exchange fails. A function gets the nonce sent in /start (so the happy path echoes it). */
  identity: ((nonce: string) => OidcIdentity) | null = (nonce) => ({ sub: "g-reviewer@gmail.test", email: "reviewer@gmail.test", emailVerified: true, name: "Rita Reviewer", nonce });
  private lastNonce = "";
  authorizeUrl(req: Parameters<OidcProvider["authorizeUrl"]>[0]) {
    this.lastNonce = req.nonce;
    return this.real.authorizeUrl(req);
  }
  async exchange(code: string, verifier: string, redirectUri: string) {
    this.calls.push({ code, verifier, redirectUri });
    if (!this.identity) throw new OidcError("exchange refused");
    return this.identity(this.lastNonce);
  }
}

function googleApp(fake = new FakeGoogle(), env: Record<string, string> = {}) {
  return { app: testApp({ env: { ...googleEnv, ...env }, oidc: fake }), fake };
}

/** Runs /start and returns what the browser would carry to /callback. */
async function start(app: ReturnType<typeof testApp>, next?: string) {
  const res = await app.request(`/api/auth/google/start${next !== undefined ? `?next=${encodeURIComponent(next)}` : ""}`);
  expect(res.status).toBe(302);
  const location = new URL(res.headers.get("location")!);
  const setCookie = res.headers.get("set-cookie") ?? "";
  const m = setCookie.match(new RegExp(`${STATE_COOKIE}=([^;]+)`));
  return { res, location, setCookie, cookie: m ? `${STATE_COOKIE}=${m[1]}` : "", state: location.searchParams.get("state")! };
}

const callback = (app: ReturnType<typeof testApp>, query: string, cookie?: string) =>
  app.request(`/api/auth/google/callback?${query}`, cookie ? { headers: { cookie } } : {});

describe("SLM-8 GET /api/auth/providers", () => {
  it("reports google off and demo on with the default test config", async () => {
    const res = await testApp().request("/api/auth/providers");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ google: false, demo: true });
  });
  it("reports google on when both client values are set", async () => {
    const res = await testApp({ env: { ...googleEnv, DEMO_ACCOUNTS_ENABLED: "false" } }).request("/api/auth/providers");
    expect(await res.json()).toEqual({ google: true, demo: false });
  });
});

describe("SLM-8 config", () => {
  it("refuses only one of GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET", () => {
    expect(() => loadConfig({ ...testEnv, GOOGLE_CLIENT_ID: "x" })).toThrow(/set together/);
    expect(() => loadConfig({ ...testEnv, GOOGLE_CLIENT_SECRET: "x" })).toThrow(/set together/);
    expect(loadConfig({ ...testEnv }).google).toBeNull();
    expect(loadConfig({ ...testEnv, ...googleEnv }).google).toEqual(CLIENT);
  });
});

describe("SLM-8 GET /api/auth/google/start", () => {
  it("404 when Google is not configured", async () => {
    expect((await testApp().request("/api/auth/google/start")).status).toBe(404);
    expect((await testApp().request("/api/auth/google/callback?code=x&state=y")).status).toBe(404);
  });

  it("302 to Google with PKCE S256, state, nonce, scopes and a locked-down state cookie", async () => {
    const { app } = googleApp();
    const { location, setCookie } = await start(app, "/books?q=dune");
    expect(`${location.origin}${location.pathname}`).toBe(GOOGLE_AUTHORIZE_URL);
    const p = location.searchParams;
    expect(p.get("client_id")).toBe(CLIENT.clientId);
    expect(p.get("response_type")).toBe("code");
    expect(p.get("scope")).toBe("openid email profile");
    expect(p.get("redirect_uri")).toBe(`${ORIGIN}/api/auth/google/callback`);
    expect(p.get("code_challenge_method")).toBe("S256");
    expect(p.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(p.get("state")!.length).toBeGreaterThanOrEqual(32);
    expect(p.get("nonce")!.length).toBeGreaterThanOrEqual(32);
    expect(p.get("prompt")).toBe("select_account");
    expect(setCookie).toContain(`${STATE_COOKIE}=`);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Path=\/api\/auth\/google/);
    expect(setCookie).toMatch(/Max-Age=600/);
    // The client secret never reaches the browser.
    expect(location.toString()).not.toContain(CLIENT.clientSecret);
  });

  it("each start gets a fresh state and nonce", async () => {
    const { app } = googleApp();
    const a = await start(app);
    const b = await start(app);
    expect(a.state).not.toBe(b.state);
    expect(a.location.searchParams.get("nonce")).not.toBe(b.location.searchParams.get("nonce"));
  });
});

describe("SLM-8 google/start rate limit", () => {
  it("the 11th start in a minute from one IP goes back to sign-in with google_busy", async () => {
    const { app } = googleApp();
    const start = () => app.request("/api/auth/google/start", { headers: { "cf-connecting-ip": "203.0.113.9" } });
    for (let i = 0; i < 10; i++) expect((await start()).headers.get("location")).toMatch(/^https:\/\/accounts\.google\.com\//);
    const res = await start();
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/signin?error=google_busy");
    // Another IP is not affected.
    const other = await app.request("/api/auth/google/start", { headers: { "cf-connecting-ip": "203.0.113.10" } });
    expect(other.headers.get("location")).toMatch(/^https:\/\/accounts\.google\.com\//);
  });
});

describe("SLM-8 GET /api/auth/google/callback", () => {
  it("happy path: PKCE verifier matches the challenge, session cookie set, state cookie cleared, 302 to next", async () => {
    const { app, fake } = googleApp();
    const s = await start(app, "/members?page=2");
    const res = await callback(app, `code=auth-code-1&state=${s.state}`, s.cookie);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/members?page=2");
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]!.code).toBe("auth-code-1");
    expect(fake.calls[0]!.redirectUri).toBe(`${ORIGIN}/api/auth/google/callback`);
    expect(await pkceChallenge(fake.calls[0]!.verifier)).toBe(s.location.searchParams.get("code_challenge"));

    const session = sessionCookieFrom(res);
    expect(session).toBeTruthy();
    const setCookie = res.headers.get("set-cookie")!;
    expect(setCookie).toMatch(new RegExp(`${STATE_COOKIE}=;.*Max-Age=0`, "i"));
    const me = await app.request("/api/me", { headers: { cookie: session! } });
    expect(await me.json()).toMatchObject({ email: "reviewer@gmail.test", fullName: "Rita Reviewer" });
  });

  it("unknown-google-is-supervisor-readonly", async () => {
    const { app } = googleApp();
    const s = await start(app);
    const res = await callback(app, `code=c&state=${s.state}`, s.cookie);
    expect(res.headers.get("location")).toBe("/");
    const session = sessionCookieFrom(res)!;
    expect(await (await app.request("/api/me", { headers: { cookie: session } })).json()).toMatchObject({ role: "SUPERVISOR" });
    const write = await app.request("/api/books", {
      method: "POST",
      headers: { cookie: session, origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ title: "Clean Architecture", author: "Robert C. Martin", category: "Software Architecture", totalCopies: 3 }),
    });
    expect(write.status).toBe(403);
    expect(await write.json()).toMatchObject({ code: "FORBIDDEN" });
    expect((await pool.query("SELECT count(*)::int AS n FROM books")).rows[0].n).toBe(0);
    // Signing in again does not create a second row.
    const again = await start(app);
    await callback(app, `code=c2&state=${again.state}`, again.cookie);
    expect((await pool.query("SELECT count(*)::int AS n FROM staff_users WHERE email = 'reviewer@gmail.test'")).rows[0].n).toBe(1);
  });

  it("bootstrap email → ADMIN", async () => {
    const fake = new FakeGoogle();
    fake.identity = (nonce) => ({ sub: "g-boss@example.org", email: "Boss@Example.org", emailVerified: true, name: "The Boss", nonce });
    const { app } = googleApp(fake);
    const s = await start(app);
    const session = sessionCookieFrom(await callback(app, `code=c&state=${s.state}`, s.cookie))!;
    expect(await (await app.request("/api/me", { headers: { cookie: session } })).json()).toMatchObject({ role: "ADMIN", email: "boss@example.org" });
  });

  it("unverified Google email → error=google_unverified, no session, no row", async () => {
    const fake = new FakeGoogle();
    fake.identity = (nonce) => ({ sub: "g-new@gmail.test", email: "new@gmail.test", emailVerified: false, name: null, nonce });
    const { app } = googleApp(fake);
    const s = await start(app);
    const res = await callback(app, `code=c&state=${s.state}`, s.cookie);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/signin?error=google_unverified");
    expect(sessionCookieFrom(res)).toBeNull();
    expect((await pool.query("SELECT count(*)::int AS n FROM staff_users WHERE email = 'new@gmail.test'")).rows[0].n).toBe(0);
  });

  const failures: [string, (s: Awaited<ReturnType<typeof start>>) => [string, string | undefined]][] = [
    ["state mismatch", (s) => [`code=c&state=not-${s.state}`, s.cookie]],
    ["missing state cookie", (s) => [`code=c&state=${s.state}`, undefined]],
    ["tampered state cookie", (s) => [`code=c&state=${s.state}`, s.cookie.slice(0, -3) + (s.cookie.endsWith("AAA") ? "BBB" : "AAA")]],
    ["missing code", (s) => [`state=${s.state}`, s.cookie]],
    ["Google error param", (s) => [`error=access_denied&state=${s.state}`, s.cookie]],
  ];
  for (const [name, build] of failures) {
    it(`${name} → error=google, no session, no exchange`, async () => {
      const { app, fake } = googleApp();
      const s = await start(app);
      const [query, cookie] = build(s);
      const res = await callback(app, query, cookie);
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/signin?error=google");
      expect(sessionCookieFrom(res)).toBeNull();
      expect(fake.calls).toHaveLength(0);
    });
  }

  it("a state cookie signed with another secret is refused", async () => {
    const { app } = googleApp();
    const other = googleApp(new FakeGoogle(), { SESSION_SECRET: "another-session-secret-0123456789abcdef" }).app;
    const s = await start(other);
    const res = await callback(app, `code=c&state=${s.state}`, s.cookie);
    expect(res.headers.get("location")).toBe("/signin?error=google");
  });

  it("a session cookie is not accepted as a state cookie", async () => {
    const { app } = googleApp();
    const s = await start(app);
    const session = sessionCookieFrom(await callback(app, `code=c&state=${s.state}`, s.cookie))!;
    const res = await callback(app, `code=c&state=x`, `${STATE_COOKIE}=${session.split("=")[1]}`);
    expect(res.headers.get("location")).toBe("/signin?error=google");
  });

  it("nonce mismatch → error=google", async () => {
    const fake = new FakeGoogle();
    fake.identity = () => ({ sub: "g-reviewer@gmail.test", email: "reviewer@gmail.test", emailVerified: true, name: null, nonce: "someone-elses-nonce" });
    const { app } = googleApp(fake);
    const s = await start(app);
    const res = await callback(app, `code=c&state=${s.state}`, s.cookie);
    expect(res.headers.get("location")).toBe("/signin?error=google");
    expect(sessionCookieFrom(res)).toBeNull();
  });

  it("code exchange or token verification failure → error=google", async () => {
    const fake = new FakeGoogle();
    fake.identity = null;
    const { app } = googleApp(fake);
    const s = await start(app);
    const res = await callback(app, `code=c&state=${s.state}`, s.cookie);
    expect(res.headers.get("location")).toBe("/signin?error=google");
    expect(sessionCookieFrom(res)).toBeNull();
  });

  it("disabled staff user → error=disabled, no session", async () => {
    const fake = new FakeGoogle();
    fake.identity = (nonce) => ({ sub: "g-disabled@library.test", email: "disabled@library.test", emailVerified: true, name: null, nonce });
    const { app } = googleApp(fake);
    const s = await start(app);
    const res = await callback(app, `code=c&state=${s.state}`, s.cookie);
    expect(res.headers.get("location")).toBe("/signin?error=disabled");
    expect(sessionCookieFrom(res)).toBeNull();
  });

  for (const next of ["//evil.example", "https://evil.example/x", "/\\evil.example", "/signin?next=/x"]) {
    it(`open redirect next=${next} falls back to /`, async () => {
      const { app } = googleApp();
      const s = await start(app, next);
      const res = await callback(app, `code=c&state=${s.state}`, s.cookie);
      expect(res.headers.get("location")).toBe("/");
    });
  }
});

describe("SLM-8 GoogleOidcProvider ID-token verification (local key pair)", () => {
  let privateKey: CryptoKey;
  let otherKey: CryptoKey;
  let jwks: JWTVerifyGetKey;
  beforeAll(async () => {
    const pair = await generateKeyPair("RS256");
    privateKey = pair.privateKey;
    otherKey = (await generateKeyPair("RS256")).privateKey;
    jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256", use: "sig" }] });
  });

  const idToken = (claims: Record<string, unknown> = {}, opts: { key?: CryptoKey; kid?: string; exp?: number | string } = {}) => {
    const { iss = "https://accounts.google.com", aud = CLIENT.clientId, ...rest } = claims;
    return new SignJWT({ email: "x@gmail.test", email_verified: true, name: "X", nonce: "n1", ...rest })
      .setProtectedHeader({ alg: "RS256", kid: opts.kid ?? "k1" })
      .setIssuer(iss as string)
      .setAudience(aud as string)
      .setSubject("google-sub-1")
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? "5m")
      .sign(opts.key ?? privateKey);
  };
  const provider = (f?: typeof fetch) => new GoogleOidcProvider(CLIENT, { jwks, fetch: f });

  it("accepts a valid token from either Google issuer form", async () => {
    expect(await provider().verifyIdToken(await idToken())).toEqual({ sub: "google-sub-1", email: "x@gmail.test", emailVerified: true, name: "X", nonce: "n1" });
    expect((await provider().verifyIdToken(await idToken({ iss: "accounts.google.com" }))).email).toBe("x@gmail.test");
    expect((await provider().verifyIdToken(await idToken({ email_verified: false }))).emailVerified).toBe(false);
  });

  it.each([
    ["wrong aud", () => idToken({ aud: "someone-else" })],
    ["wrong iss", () => idToken({ iss: "https://evil.example" })],
    ["expired", () => idToken({}, { exp: Math.floor(Date.now() / 1000) - 600 })],
    ["bad signature", () => idToken({}, { key: otherKey })],
    ["unknown kid", () => idToken({}, { kid: "k2" })],
    ["no email", () => idToken({ email: undefined })],
  ])("rejects %s", async (_name, make) => {
    await expect(provider().verifyIdToken(await make())).rejects.toBeInstanceOf(OidcError);
  });

  it("exchange posts the code + PKCE verifier to the token endpoint and verifies the returned ID token", async () => {
    const token = await idToken();
    let sent: { url: string; body: URLSearchParams } | null = null;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      sent = { url, body: new URLSearchParams(init.body as string) };
      return new Response(JSON.stringify({ id_token: token, access_token: "unused" }), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    const identity = await provider(fakeFetch).exchange("the-code", "the-verifier", "http://localhost/api/auth/google/callback");
    expect(identity.email).toBe("x@gmail.test");
    expect(sent!.url).toBe(GOOGLE_TOKEN_URL);
    expect(Object.fromEntries(sent!.body)).toEqual({
      grant_type: "authorization_code",
      code: "the-code",
      code_verifier: "the-verifier",
      redirect_uri: "http://localhost/api/auth/google/callback",
      client_id: CLIENT.clientId,
      client_secret: CLIENT.clientSecret,
    });
  });

  it("exchange fails cleanly when Google refuses the code", async () => {
    const fakeFetch = (async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })) as unknown as typeof fetch;
    await expect(provider(fakeFetch).exchange("c", "v", "r")).rejects.toBeInstanceOf(OidcError);
  });
});

describe("SLM-8 follow-up (Yousef): Google never signs in to a demo account; sub binding; callback limit", () => {
  /** Full browser round trip with the fake provider returning `who`; returns the callback response. */
  async function googleSignIn(who: { sub: string; email: string }) {
    const fake = new FakeGoogle();
    fake.identity = (nonce) => ({ ...who, emailVerified: true, name: null, nonce });
    const { app } = googleApp(fake);
    const s = await start(app);
    return callback(app, `code=c&state=${s.state}`, s.cookie);
  }
  const staffRow = async (email: string) =>
    (await pool.query("SELECT role, status, is_demo, google_sub FROM staff_users WHERE lower(email) = lower($1)", [email])).rows[0];

  it("a configured demo email is refused (no session, no row), even before the demo row exists", async () => {
    const res = await googleSignIn({ sub: "g-attacker", email: DEMO.admin.email });
    expect(res.headers.get("location")).toBe("/signin?error=google");
    expect(sessionCookieFrom(res)).toBeNull();
    expect(await staffRow(DEMO.admin.email)).toBeUndefined();
  });

  it("an existing demo row is refused too (e.g. a demo email that config no longer lists)", async () => {
    await pool.query("INSERT INTO staff_users (email, full_name, role, is_demo) VALUES ('old-demo@demo.test', 'Old Demo', 'ADMIN', true)");
    const res = await googleSignIn({ sub: "g-old", email: "old-demo@demo.test" });
    expect(res.headers.get("location")).toBe("/signin?error=google");
    expect(sessionCookieFrom(res)).toBeNull();
    expect(await staffRow("old-demo@demo.test")).toMatchObject({ google_sub: null });
  });

  it("the first Google sign-in binds sub to an existing row; another sub with the same email is refused", async () => {
    await pool.query("INSERT INTO staff_users (email, full_name, role) VALUES ('nadia@library.test', 'Nadia Karim', 'LIBRARIAN')");
    const first = await googleSignIn({ sub: "g-nadia", email: "nadia@library.test" });
    expect(sessionCookieFrom(first)).toBeTruthy();
    expect(await staffRow("nadia@library.test")).toMatchObject({ role: "LIBRARIAN", google_sub: "g-nadia" });
    const other = await googleSignIn({ sub: "g-someone-else", email: "nadia@library.test" });
    expect(other.headers.get("location")).toBe("/signin?error=google");
    expect(sessionCookieFrom(other)).toBeNull();
  });

  it("the row is found by sub, so an email change at Google keeps the same staff user", async () => {
    await googleSignIn({ sub: "g-omar", email: "omar@library.test" });
    const id = (await pool.query("SELECT id FROM staff_users WHERE google_sub = 'g-omar'")).rows[0].id;
    const res = await googleSignIn({ sub: "g-omar", email: "omar.nasser@library.test" });
    expect(sessionCookieFrom(res)).toBeTruthy();
    expect((await pool.query("SELECT id FROM staff_users WHERE google_sub = 'g-omar'")).rows).toEqual([{ id }]);
    expect((await pool.query("SELECT count(*)::int n FROM staff_users WHERE email LIKE 'omar%'")).rows[0].n).toBe(1);
  });

  it("config refuses demo emails outside .test, .invalid or .example", () => {
    for (const email of ["someone@gmail.com", "admin@demo.test.com", "admin@company.example.org"]) {
      expect(() => testApp({ env: { DEMO_ADMIN_EMAIL: email } })).toThrow(/DEMO_ADMIN_EMAIL must end in/);
    }
    for (const email of ["admin@demo.test", "admin@library.invalid", "admin@x.example"]) {
      expect(() => testApp({ env: { DEMO_ADMIN_EMAIL: email } })).not.toThrow();
    }
  });

  it("the 11th callback in a minute from one IP goes back to sign-in with google_busy, before any exchange", async () => {
    const { app, fake } = googleApp();
    const hit = () => app.request("/api/auth/google/callback?code=x&state=y", { headers: { "cf-connecting-ip": "203.0.113.20" } });
    for (let i = 0; i < 10; i++) expect((await hit()).headers.get("location")).toBe("/signin?error=google");
    const res = await hit();
    expect(res.headers.get("location")).toBe("/signin?error=google_busy");
    expect(fake.calls).toHaveLength(0);
  });
});
