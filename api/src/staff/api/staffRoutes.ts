import { StaffUserListQuerySchema, StaffUserUpdateSchema, type StaffUserDto } from "@slm/contracts";
import { Hono } from "hono";
import type { AppEnv } from "../../platform/appEnv";
import { parseOr400 } from "../../platform/http";
import { requirePermission } from "../../platform/security/requirePermission";
import type { StaffUser } from "../domain/StaffUser";

export const toStaffUserDto = (u: StaffUser): StaffUserDto => ({
  id: u.id, email: u.email, fullName: u.fullName, role: u.role, status: u.status, isDemo: u.isDemo, createdAt: u.createdAt.toISOString(),
});

/**
 * /api/staff-users (SLM-8), Admin only (STAFF_MANAGE). No POST: people appear after their first
 * Google sign-in (ux.md §3.7, scope D10).
 */
export function staffRoutes() {
  const r = new Hono<AppEnv>();

  r.get("/", requirePermission("STAFF_MANAGE"), async (c) => {
    const query = parseOr400(StaffUserListQuerySchema, c.req.query());
    const page = await c.var.container.staffAdmin.list(query);
    return c.json({ ...page, items: page.items.map(toStaffUserDto) });
  });

  r.put("/:id", requirePermission("STAFF_MANAGE"), async (c) => {
    const change = parseOr400(StaffUserUpdateSchema, await c.req.json().catch(() => null));
    const user = await c.var.container.staffAdmin.changeAccess(c.var.principal.id, c.req.param("id"), change);
    return c.json(toStaffUserDto(user));
  });

  return r;
}
