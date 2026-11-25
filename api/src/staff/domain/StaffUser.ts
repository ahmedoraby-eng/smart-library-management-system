import type { Role } from "@slm/contracts";

export type StaffStatus = "ACTIVE" | "DISABLED";

export interface StaffUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  status: StaffStatus;
  isDemo: boolean;
  /** Google's stable subject id, bound on the first Google sign-in (null for demo and not-yet-bound rows). */
  googleSub?: string | null;
  createdAt: Date;
}

export interface StaffUserRepository {
  findByEmail(email: string): Promise<StaffUser | null>;
  findById(id: string): Promise<StaffUser | null>;
  /** First Google sign-in: insert if absent (race-safe); returns the stored row either way. */
  provision(input: { email: string; fullName: string; role: Role; googleSub: string }): Promise<StaffUser>;
  findByGoogleSub(sub: string): Promise<StaffUser | null>;
  /** Binds the Google subject to a row that has none yet; returns false if the row already had one. */
  bindGoogleSub(id: string, sub: string): Promise<boolean>;
  /** Demo accounts come from config: create or restore them (role, ACTIVE, is_demo). */
  upsertDemo(input: { email: string; fullName: string; role: Role }): Promise<StaffUser>;
  list(): Promise<StaffUser[]>;
  update(id: string, change: { role: Role; status: StaffStatus }): Promise<StaffUser | null>;
}

export interface StaffListParams {
  q?: string;
  page: number;
  size: number;
}

/** Role/status change under row locks: the target and every ACTIVE ADMIN are locked, then `decide` runs. */
export interface StaffAccessStore {
  /** Sorted by name (case-insensitive), then id; q matches name or email. */
  search(p: StaffListParams): Promise<{ items: StaffUser[]; total: number }>;
  /**
   * Locks the target and the ACTIVE ADMIN rows (one ordered `FOR UPDATE`, so two concurrent demotions
   * can't both pass), asks `decide`, and applies the change only when it returns null.
   * Returns null for an unknown id.
   */
  changeAccess<V>(
    id: string,
    change: { role: Role; status: StaffStatus },
    decide: (target: StaffUser, activeAdminIds: string[]) => V | null,
  ): Promise<{ kind: "ok"; user: StaffUser } | { kind: "refused"; reason: V } | null>;
}
