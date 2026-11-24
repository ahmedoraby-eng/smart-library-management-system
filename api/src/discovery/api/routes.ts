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

/** /api/admin/discovery (SLM-16): rebuild the hybrid-retrieval index (backfill after the migration, or a model change). */
export function discoveryAdminRoutes() {
  const r = new Hono<AppEnv>();
  r.post("/reindex", requirePermission("STAFF_MANAGE"), async (c) => {
    const index = c.var.container.bookIndex;
    if (!index.enabled) return c.json({ result: "disabled", embeddedBooks: 0, chunks: 0, upToDate: 0, removed: 0 });
    return c.json({ result: "done", ...(await index.syncAll()) });
  });
  return r;
}
