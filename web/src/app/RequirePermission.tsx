import type { Permission } from "@slm/contracts";
import { Navigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useCan, useMe } from "../features/auth/session";

/**
 * Deep links to a page the role can't use land on /403 (ux.md §1 "Role rule"). The API refuses the same calls.
 * Waits for /api/me first, so a page never redirects while the session is still loading.
 */
export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const me = useMe();
  const can = useCan();
  if (me.isPending) return null;
  return can(permission) ? <>{children}</> : <Navigate to="/403" replace />;
}
