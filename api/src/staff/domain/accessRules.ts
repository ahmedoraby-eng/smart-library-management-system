import type { Role } from "@slm/contracts";
import type { StaffStatus, StaffUser } from "./StaffUser";

export interface AccessChange {
  role: Role;
  status: StaffStatus;
}

/** Why an Admin's role/status change is refused (ux.md §3.7, architecture §5). */
export type AccessViolation = "actor_not_admin" | "protected_demo" | "self" | "last_admin";

const isActiveAdmin = (u: { role: Role; status: StaffStatus }) => u.role === "ADMIN" && u.status === "ACTIVE";

/**
 * The staff-management rules, checked against rows the repository has locked:
 * - the actor must still be an ACTIVE ADMIN under the lock (its principal was read at the start of
 *   the request; a demotion or disable that committed since then wins) - Yousef, SLM-8 review;
 * - demo accounts are locked, so every reviewer can still sign in with them;
 * - an Admin can't change their own role or status (no self lock-out);
 * - the change must leave at least one ACTIVE ADMIN.
 * A change that changes nothing is always allowed (idempotent PUT).
 */
export function accessViolation(
  target: StaffUser,
  change: AccessChange,
  actorId: string,
  activeAdminIds: readonly string[],
): AccessViolation | null {
  if (!activeAdminIds.includes(actorId)) return "actor_not_admin";
  if (target.role === change.role && target.status === change.status) return null;
  if (target.isDemo) return "protected_demo";
  if (target.id === actorId) return "self";
  if (isActiveAdmin(target) && !isActiveAdmin(change) && activeAdminIds.filter((id) => id !== target.id).length === 0) {
    return "last_admin";
  }
  return null;
}
