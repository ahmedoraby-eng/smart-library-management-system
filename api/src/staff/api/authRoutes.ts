import { DemoLoginSchema, type AuthProviders, type Me } from "@slm/contracts";
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { jwtVerify, SignJWT } from "jose";
import type { AppEnv } from "../../platform/appEnv";
import type { Config } from "../../platform/config";
import { ForbiddenError, NotFoundError } from "../../platform/errors";
import { parseOr400 } from "../../platform/http";
import { RateLimitedError, type Limiter } from "../../platform/security/rateLimit";
import type { Principal } from "../../platform/security/principal";
import { clearSession, issueSession } from "../../platform/security/session";
import { GoogleSignInError, type PendingGoogleSignIn } from "../application/GoogleSignIn";

export const toMe = (p: Principal): Me => ({
  id: p.id,
  email: p.email,
  fullName: p.fullName,
  role: p.role,
  isDemo: p.isDemo,
  permissions: [...p.permissions],
});

/** Public sign-in routes. They set or clear the session cookie; no other auth state exists. */
export function authRoutes(
  demoLoginLimiter: (c: Context<AppEnv>) => Limiter,
  googleStartLimiter: (c: Context<AppEnv>) => Limiter,
  googleCallbackLimiter: (c: Context<AppEnv>) => Limiter,
) {
  const r = new Hono<AppEnv>();

  r.post("/demo-login", async (c) => {
    const { config, staffIdentity } = c.var.container;
    if (!config.demoAccountsEnabled) throw new NotFoundError("Demo sign-in");
    await demoLoginLimiter(c).check(`demo-login:${c.req.header("cf-connecting-ip") ?? "local"}`);
    const body = parseOr400(DemoLoginSchema, await c.req.json().catch(() => null));
    const principal = await staffIdentity.signInWithDemo(body.email, body.password);
    await issueSession(c, config, principal.id);
    return c.json(toMe(principal));
  });

  r.post("/logout", (c) => {
    clearSession(c);
    return c.body(null, 204);
  });

  /** Which sign-in doors are open, so the sign-in page shows only working buttons. */
  r.get("/providers", (c) => {
    const { config } = c.var.container;
    const body: AuthProviders = { google: config.google !== null, demo: config.demoAccountsEnabled };
    return c.json(body);
  });

  r.get("/google/start", async (c) => {
    const { config, googleSignIn } = c.var.container;
    if (!config.google || !googleSignIn) throw new NotFoundError("Google sign-in");
    // A browser navigation, so a limit hit goes back to the sign-in page with a notice, not JSON.
    try {
      await googleStartLimiter(c).check(`google-start:${c.req.header("cf-connecting-ip") ?? "local"}`);
    } catch (e) {
      if (e instanceof RateLimitedError) return c.redirect("/signin?error=google_busy", 302);
      throw e;
    }
    const { url, pending } = await googleSignIn.begin(redirectUriFor(c), c.req.query("next"));
    await setGoogleStateCookie(c, config, pending);
    return c.redirect(url, 302);
  });

  r.get("/google/callback", async (c) => {
    const { config, googleSignIn } = c.var.container;
    if (!config.google || !googleSignIn) throw new NotFoundError("Google sign-in");
    // Limited per IP before any work: the callback does the token exchange and DB provisioning.
    try {
      await googleCallbackLimiter(c).check(`google-callback:${c.req.header("cf-connecting-ip") ?? "local"}`);
    } catch (e) {
      if (e instanceof RateLimitedError) return c.redirect("/signin?error=google_busy", 302);
      throw e;
    }
    const pending = await readGoogleStateCookie(c, config);
    // One-time use: the state cookie is cleared whatever the outcome.
    deleteCookie(c, GOOGLE_STATE_COOKIE, { path: GOOGLE_STATE_PATH, secure: true });
    try {
      const principal = await googleSignIn.complete(
        pending,
        { code: c.req.query("code"), state: c.req.query("state"), error: c.req.query("error") },
        redirectUriFor(c),
      );
      await issueSession(c, config, principal.id);
      return c.redirect(pending?.next ?? "/", 302);
    } catch (e) {
      if (e instanceof GoogleSignInError) {
        console.info(
          JSON.stringify({
            level: "info",
            event: "google_signin_failed",
            reason: e.reason,
            detail: e.message,
            requestId: c.var.requestId,
          }),
        );
        return c.redirect(`/signin?error=${e.reason}`, 302);
      }
      if (e instanceof ForbiddenError && e.code === "USER_DISABLED") return c.redirect("/signin?error=disabled", 302);
      throw e;
    }
  });

  return r;
}

export const GOOGLE_STATE_COOKIE = "slm_google_state";
const GOOGLE_STATE_PATH = "/api/auth/google";
const GOOGLE_STATE_MINUTES = 10;
const GOOGLE_STATE_TYP = "slm-google-state";

const stateKey = (secret: string) => new TextEncoder().encode(secret);
const redirectUriFor = (c: Context) => `${new URL(c.req.url).origin}/api/auth/google/callback`;

/** state + PKCE verifier + nonce + next, signed (HS256, SESSION_SECRET), HttpOnly, 10 minutes, only sent to /api/auth/google. */
async function setGoogleStateCookie(c: Context, config: Config, pending: PendingGoogleSignIn): Promise<void> {
  const token = await new SignJWT({ ...pending })
    .setProtectedHeader({ alg: "HS256", typ: GOOGLE_STATE_TYP })
    .setIssuedAt()
    .setExpirationTime(`${GOOGLE_STATE_MINUTES}m`)
    .sign(stateKey(config.sessionSecret));
  setCookie(c, GOOGLE_STATE_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: GOOGLE_STATE_PATH,
    maxAge: GOOGLE_STATE_MINUTES * 60,
  });
}

async function readGoogleStateCookie(c: Context, config: Config): Promise<PendingGoogleSignIn | null> {
  const token = getCookie(c, GOOGLE_STATE_COOKIE);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, stateKey(config.sessionSecret), {
      algorithms: ["HS256"],
      typ: GOOGLE_STATE_TYP,
    });
    const { state, verifier, nonce, next } = payload as Record<string, unknown>;
    if (typeof state !== "string" || typeof verifier !== "string" || typeof nonce !== "string") return null;
    return { state, verifier, nonce, next: typeof next === "string" ? next : null };
  } catch {
    return null;
  }
}
