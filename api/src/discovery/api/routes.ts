import { DiscoveryRequestSchema } from "@slm/contracts";
import { Hono, type Context } from "hono";
import type { AppEnv } from "../../platform/appEnv";
import { parseOr400 } from "../../platform/http";
import type { Limiter } from "../../platform/security/rateLimit";
import { requirePermission } from "../../platform/security/requirePermission";

/** /api/ai (SLM-9). Permission first, then the per-user rate limit, then validation. */
export function discoveryRoutes(limiter: (c: Context<AppEnv>) => Limiter) {
  const r = new Hono<AppEnv>();
  r.post("/book-discovery", requirePermission("AI_DISCOVER"), async (c) => {
    await limiter(c).check(`discovery:${c.var.principal.id}`);
    const input = parseOr400(DiscoveryRequestSchema, await c.req.json().catch(() => null));
    return c.json(await c.var.container.discovery.discover(input));
  });
  return r;
}
