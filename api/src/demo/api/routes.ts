import { Hono } from "hono";
import type { AppEnv } from "../../platform/appEnv";
import { requirePermission } from "../../platform/security/requirePermission";

export function adminRoutes() {
  const r = new Hono<AppEnv>();
  // Same job as the nightly Cron Trigger (architecture §5.2a).
  r.post("/reset-demo", requirePermission("STAFF_MANAGE"), async (c) => {
    await c.var.container.demoData.reset();
    await c.var.container.bookIndex.syncAllSafely(); // SLM-16: the seed gives books new ids
    return c.json({ result: "reset" });
  });
  return r;
}
