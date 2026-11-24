import type { Role } from "@slm/contracts";

export type StaffStatus = "ACTIVE" | "DISABLED";

export interface StaffUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  status: StaffStatus;
  isDemo: boolean;
  createdAt: Date;
}

export interface StaffUserRepository {
  findByEmail(email: string): Promise<StaffUser | null>;
  findById(id: string): Promise<StaffUser | null>;
  /** First Google sign-in: insert if absent (race-safe); returns the stored row either way. */
  provision(input: { email: string; fullName: string; role: Role }): Promise<StaffUser>;
  /** Demo accounts come from config: create or restore them (role, ACTIVE, is_demo). */
  upsertDemo(input: { email: string; fullName: string; role: Role }): Promise<StaffUser>;
  list(): Promise<StaffUser[]>;
  update(id: string, change: { role: Role; status: StaffStatus }): Promise<StaffUser | null>;
}
