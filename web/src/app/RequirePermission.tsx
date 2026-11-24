import type { Permission } from "@slm/contracts";
import { Navigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useCan } from "../features/auth/session";

/** Deep links to a page the role can't use land on /403 (ux.md §1 "Role rule"). The API refuses the same calls. */
export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const can = useCan();
  return can(permission) ? <>{children}</> : <Navigate to="/403" replace />;
}
