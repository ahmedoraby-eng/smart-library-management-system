import { createMiddleware } from "hono/factory";
import { ForbiddenError } from "../errors";

/**
 * CSRF defence with SameSite=Lax cookies: every state-changing request must come from our own
 * origin (Origin header present and equal to the request's origin) and carry a JSON body.
 */
export const sameOriginWrites = createMiddleware(async (c, next) => {
  const method = c.req.method;
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    const origin = c.req.header("origin");
    if (!origin || origin !== new URL(c.req.url).origin) throw new ForbiddenError("FORBIDDEN", "Cross-origin request refused.");
    const type = c.req.header("content-type") ?? "";
    const length = c.req.header("content-length");
    const hasBody = (length !== undefined && length !== "0") || c.req.header("transfer-encoding") !== undefined;
    if (hasBody && !type.startsWith("application/json")) {
      throw new ForbiddenError("FORBIDDEN", "Only JSON request bodies are accepted.");
    }
  }
  await next();
});
