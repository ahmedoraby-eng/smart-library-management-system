import type { StaffUserListQuery } from "@slm/contracts";
import { ConflictError, ForbiddenError, NotFoundError, type AppError } from "../../platform/errors";
import { accessViolation, type AccessChange, type AccessViolation } from "../domain/accessRules";
import type { StaffAccessStore, StaffUser } from "../domain/StaffUser";

/** ux.md §3.7 sentences: the UI shows `detail` as the toast. */
const refusal: Record<AccessViolation, () => AppError> = {
  actor_not_admin: () => new ForbiddenError("FORBIDDEN", "You are no longer an active Admin."),
  protected_demo: () => new ConflictError("PROTECTED_DEMO_ACCOUNT", "Demo account", "Demo accounts are protected so every reviewer can use them."),
  self: () => new ConflictError("CANNOT_CHANGE_SELF", "Own account", "You can't change your own role or status."),
  last_admin: () => new ConflictError("LAST_ADMIN", "Last Admin", "This is the last active Admin. Make someone else an Admin first."),
};

/**
 * Staff management (SLM-8): list and role/status changes. Authorization (STAFF_MANAGE) is checked
 * by the route guard; the rules here protect demo accounts, the acting Admin and the last Admin.
 * Role and status are read from the DB on every request, so a change applies on the next call.
 */
export class StaffAdminService {
  constructor(private readonly store: StaffAccessStore) {}

  async list(query: StaffUserListQuery) {
    const { items, total } = await this.store.search({ ...(query.q ? { q: query.q } : {}), page: query.page, size: query.size });
    return { items, total, page: query.page, size: query.size };
  }

  async changeAccess(actorId: string, id: string, change: AccessChange): Promise<StaffUser> {
    const r = await this.store.changeAccess(id, change, (target, admins) => accessViolation(target, change, actorId, admins));
    if (!r) throw new NotFoundError("This staff user");
    if (r.kind === "refused") throw refusal[r.reason]();
    return r.user;
  }
}
