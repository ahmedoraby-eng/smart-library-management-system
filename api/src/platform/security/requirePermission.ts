import type { Permission } from "@slm/contracts";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../appEnv";
import { ForbiddenError } from "../errors";
import { can } from "./principal";

/** Route guard: every protected route declares the permission it needs (rbac-matrix.md). */
export const requirePermission = (perm: Permission) =>
  createMiddleware<AppEnv>(async (c, next) => {
    if (!can(c.var.principal, perm)) throw new ForbiddenError();
    await next();
  });
