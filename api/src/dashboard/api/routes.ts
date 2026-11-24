import { Hono } from "hono";
import type { AppEnv } from "../../platform/appEnv";
import { requirePermission } from "../../platform/security/requirePermission";

/** /api/dashboard (SLM-12). Read-only for every role that has REPORT_READ. */
export function dashboardRoutes() {
  const r = new Hono<AppEnv>();
  r.get("/summary", requirePermission("REPORT_READ"), async (c) => c.json(await c.var.container.dashboard.summary()));
  return r;
}
