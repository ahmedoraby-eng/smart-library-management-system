import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import type { Container } from "./container";
import { adminRoutes } from "./demo/api/routes";
import { AppError, UnauthenticatedError, internalProblem, toProblem } from "./platform/errors";
import { newRequestId } from "./platform/http";
import { sameOriginWrites } from "./platform/security/csrf";
import type { AppEnv } from "./platform/appEnv";
import { RateLimitedError, RateLimiter } from "./platform/security/rateLimit";
import { readSession } from "./platform/security/session";
import { authRoutes, toMe } from "./staff/api/authRoutes";

export type { AppEnv };

/** Returns the container for this request (Worker: one DB client per request; tests: a shared pool). */
export type ContainerFactory = () => Container | Promise<Container>;

export function createApp(getContainer: ContainerFactory) {
  const app = new Hono<AppEnv>().basePath("/api");
  const demoLoginLimiter = new RateLimiter(5, 60_000);
  const deepHealthLimiter = new RateLimiter(10, 60_000);

  app.use(async (c, next) => {
    const requestId = c.req.header("x-request-id") ?? newRequestId();
    c.set("requestId", requestId);
    c.header("x-request-id", requestId);
    await next();
  });

  app.onError((err, c) => {
    const requestId = c.var.requestId ?? newRequestId();
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

  // Public liveness (no DB). ?deep=1 also checks the database (rate-limited; used by the deploy smoke test).
  app.get("/health", async (c) => {
    if (c.req.query("deep") !== "1") return c.json({ status: "ok" });
    deepHealthLimiter.check("deep");
    const { db } = await getContainer();
    await db.execute(sql`SELECT 1`);
    return c.json({ status: "ok", db: "ok" });
  });

  app.use(async (c, next) => {
    c.set("container", await getContainer());
    await next();
  });

  app.route("/auth", authRoutes(demoLoginLimiter));

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
  app.route("/admin", adminRoutes());

  return app;
}
