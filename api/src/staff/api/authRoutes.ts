import { DemoLoginSchema, type Me } from "@slm/contracts";
import { Hono } from "hono";
import type { AppEnv } from "../../platform/appEnv";
import { NotFoundError } from "../../platform/errors";
import { parseOr400 } from "../../platform/http";
import type { RateLimiter } from "../../platform/security/rateLimit";
import type { Principal } from "../../platform/security/principal";
import { clearSession, issueSession } from "../../platform/security/session";

export const toMe = (p: Principal): Me => ({
  id: p.id, email: p.email, fullName: p.fullName, role: p.role, isDemo: p.isDemo, permissions: [...p.permissions],
});

/** Public sign-in routes. They set or clear the session cookie; no other auth state exists. */
export function authRoutes(demoLoginLimiter: RateLimiter) {
  const r = new Hono<AppEnv>();

  r.post("/demo-login", async (c) => {
    const { config, staffIdentity } = c.var.container;
    if (!config.demoAccountsEnabled) throw new NotFoundError("Demo sign-in");
    demoLoginLimiter.check(c.req.header("cf-connecting-ip") ?? "local");
    const body = parseOr400(DemoLoginSchema, await c.req.json().catch(() => null));
    const principal = await staffIdentity.signInWithDemo(body.email, body.password);
    await issueSession(c, config, principal.id);
    return c.json(toMe(principal));
  });

  r.post("/logout", (c) => {
    clearSession(c);
    return c.body(null, 204);
  });

  // Google OIDC (/google/start, /google/callback) lands with SL-08.
  return r;
}
