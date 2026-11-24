import { sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { createMiddleware } from "hono/factory";
import { bookRoutes } from "./catalog/api/routes";
import { loanRoutes } from "./circulation/api/routes";
import { dashboardRoutes } from "./dashboard/api/routes";
import { discoveryRoutes } from "./discovery/api/routes";
import type { Container } from "./container";
import { memberRoutes } from "./members/api/routes";
import { adminRoutes } from "./demo/api/routes";
import type { AppEnv } from "./platform/appEnv";
import { AppError, UnauthenticatedError, internalProblem, toProblem } from "./platform/errors";
import { requestIdFrom } from "./platform/http";
import { sameOriginWrites } from "./platform/security/csrf";
import { limiterFor, MemoryLimiter, RateLimitedError } from "./platform/security/rateLimit";
import { readSession } from "./platform/security/session";
import { authRoutes, toMe } from "./staff/api/authRoutes";
import { staffRoutes } from "./staff/api/staffRoutes";

export type { AppEnv };

/** Per-request dependencies. The Worker opens one DB connection per request and closes it afterwards. */
export type ContainerFactory = (c: Context<AppEnv>) => Promise<{ container: Container; close?: () => Promise<void> }>;

/**
 * Builds the Hono app. Build it ONCE per isolate (module scope in worker.ts): the in-memory
 * fallback limiters below must outlive single requests. In production the Workers Rate Limiting
 * bindings (DEMO_LOGIN_LIMITER, HEALTH_LIMITER) are used instead, shared across isolates.
 */
export function createApp(openContainer: ContainerFactory) {
  const app = new Hono<AppEnv>().basePath("/api");
  const demoLoginFallback = new MemoryLimiter(5, 60_000);
  const deepHealthFallback = new MemoryLimiter(10, 60_000);
  const discoveryFallback = new MemoryLimiter(10, 60_000);
  const googleStartFallback = new MemoryLimiter(10, 60_000);
  const googleCallbackFallback = new MemoryLimiter(10, 60_000);

  app.use(async (c, next) => {
    const requestId = requestIdFrom(c.req.header("x-request-id"));
    c.set("requestId", requestId);
    c.header("x-request-id", requestId);
    await next();
  });

  app.onError((err, c) => {
    const requestId = c.var.requestId ?? requestIdFrom(undefined);
    if (err instanceof AppError) {
      if (err instanceof RateLimitedError) c.header("retry-after", String(err.retryAfterSeconds));
      return c.json(toProblem(err, requestId), err.status as 400, { "content-type": "application/problem+json" });
    }
    console.error(JSON.stringify({ level: "error", requestId, message: String(err), stack: (err as Error)?.stack }));
    return c.json(internalProblem(requestId), 500, { "content-type": "application/problem+json" });
  });

  app.notFound((c) =>
    c.json(
      { type: "about:blank", title: "Not found", status: 404, code: "NOT_FOUND", detail: "No such endpoint.", requestId: c.var.requestId },
      404,
      { "content-type": "application/problem+json" },
    ),
  );

  app.use(sameOriginWrites);

  // Public liveness: no DB, no container.
  app.get("/health", async (c, next) => {
    if (c.req.query("deep") === "1") return next();
    return c.json({ status: "ok" });
  });

  // Everything else gets its container (one DB connection) for this request only.
  app.use(async (c, next) => {
    const { container, close } = await openContainer(c);
    c.set("container", container);
    try {
      await next();
    } finally {
      if (close) {
        const closing = close().catch(() => undefined);
        try { c.executionCtx.waitUntil(closing); } catch { await closing; } // no ExecutionContext in tests
      }
    }
  });

  // Deep health: DB check, rate-limited; used by the deploy smoke test.
  app.get("/health", async (c) => {
    await limiterFor(c.env, "HEALTH_LIMITER", deepHealthFallback, 60).check("deep");
    await c.var.container.db.execute(sql`SELECT 1`);
    return c.json({ status: "ok", db: "ok" });
  });

  app.route("/auth", authRoutes(
    (c) => limiterFor(c.env, "DEMO_LOGIN_LIMITER", demoLoginFallback, 60),
    (c) => limiterFor(c.env, "GOOGLE_START_LIMITER", googleStartFallback, 60),
    (c) => limiterFor(c.env, "GOOGLE_CALLBACK_LIMITER", googleCallbackFallback, 60),
  ));

  // Everything below needs a valid session; the role is read from the database on every request.
  app.use(
    createMiddleware<AppEnv>(async (c, next) => {
      const { config, staffIdentity } = c.var.container;
      const staffId = await readSession(c, config);
      if (!staffId) throw new UnauthenticatedError();
      c.set("principal", await staffIdentity.principalForSession(staffId));
      await next();
    }),
  );

  app.get("/me", (c) => c.json(toMe(c.var.principal)));
  app.route("/books", bookRoutes());
  app.route("/loans", loanRoutes());
  app.route("/ai", discoveryRoutes((c) => limiterFor(c.env, "DISCOVERY_LIMITER", discoveryFallback, 60)));
  app.route("/dashboard", dashboardRoutes());
  app.route("/members", memberRoutes());
  app.route("/admin", adminRoutes());
  app.route("/staff-users", staffRoutes());

  return app;
}
