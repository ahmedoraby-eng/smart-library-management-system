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
    return c.json(await c.var.container.discovery.discover(input, { userId: c.var.principal.id }));
  });
  // SLM-16: the counter next to the search box ("49 of 50 AI-assisted searches left today"). Read-only, no limiter.
  r.get("/quota", requirePermission("AI_DISCOVER"), async (c) =>
    c.json(await c.var.container.discovery.quota(c.var.principal.id)),
  );
  return r;
}

/**
 * SLM-19: GET /api/books/:id/similar ("More like this"), mounted under /api/books next to the catalogue routes.
 * Permission first, then 404 for an unknown book (the catalogue's own rule), then the neighbours. No model call,
 * so no rate limit or quota: it costs one or two SQL queries.
 */
export function similarBookRoutes() {
  const r = new Hono<AppEnv>();
  r.get("/:id/similar", requirePermission("BOOK_READ"), async (c) => {
    const id = c.req.param("id");
    await c.var.container.books.get(id); // 404 "This book was not found." for an unknown or malformed id
    return c.json(await c.var.container.similarBooks.forBook(id));
  });
  return r;
}

/** /api/admin/discovery (SLM-16): rebuild the hybrid-retrieval index (backfill after the migration, or a model change). */
export function discoveryAdminRoutes(reindexLimiter: (c: Context<AppEnv>) => Limiter) {
  const r = new Hono<AppEnv>();
  // Today's AI spend against the caps, for the Admin dashboard line.
  r.get("/usage", requirePermission("STAFF_MANAGE"), async (c) => {
    const today = await c.var.container.aiBudget.today();
    return c.json({ ...today, vectorPath: await c.var.container.bookIndex.vectorPath() });
  });
  r.post("/reindex", requirePermission("STAFF_MANAGE"), async (c) => {
    await reindexLimiter(c).check(`reindex:${c.var.principal.id}`); // 2/min: it can spend Neurons
    const index = c.var.container.bookIndex;
    if (!index.enabled)
      return c.json({
        result: "disabled",
        embeddedBooks: 0,
        chunks: 0,
        reusedBooks: 0,
        upToDate: 0,
        removed: 0,
        neurons: 0,
        remaining: 0,
        total: 0,
      });
    // One batch per call (Workers Free: 10 ms CPU). Call again while `remaining` > 0.
    const asked = Number(c.req.query("limit"));
    const batch = Number.isInteger(asked) && asked > 0 ? Math.min(asked, 100) : c.var.container.config.indexBatchBooks;
    const r = await index.syncAll(batch);
    return c.json({ result: r.remaining > 0 ? "partial" : "done", ...r });
  });
  return r;
}
