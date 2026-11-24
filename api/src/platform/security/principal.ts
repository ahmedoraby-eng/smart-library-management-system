import { ROLE_PERMISSIONS, type Permission, type Role } from "@slm/contracts";

/** The authenticated staff member for one request. */
export interface Principal {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  isDemo: boolean;
  permissions: ReadonlySet<Permission>;
}

export function principalOf(u: { id: string; email: string; fullName: string; role: Role; isDemo: boolean }): Principal {
  return { id: u.id, email: u.email, fullName: u.fullName, role: u.role, isDemo: u.isDemo, permissions: new Set(ROLE_PERMISSIONS[u.role]) };
}

export function can(p: Principal, perm: Permission): boolean {
  return p.permissions.has(perm);
}
