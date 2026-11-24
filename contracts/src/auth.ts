import { z } from "zod";

export const Role = z.enum(["ADMIN", "LIBRARIAN", "SUPERVISOR"]);
export type Role = z.infer<typeof Role>;

export const Permission = z.enum([
  "BOOK_READ",
  "BOOK_WRITE",
  "BOOK_DELETE",
  "MEMBER_READ",
  "MEMBER_WRITE",
  "LOAN_READ",
  "LOAN_PROCESS",
  "REPORT_READ",
  "AI_DISCOVER",
  "STAFF_MANAGE",
]);
export type Permission = z.infer<typeof Permission>;

/** The RBAC matrix (decisions/rbac-matrix.md). The backend enforces it; the UI only reads it via /api/me. */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: Permission.options,
  LIBRARIAN: [
    "BOOK_READ", "BOOK_WRITE", "MEMBER_READ", "MEMBER_WRITE",
    "LOAN_READ", "LOAN_PROCESS", "REPORT_READ", "AI_DISCOVER",
  ],
  SUPERVISOR: ["BOOK_READ", "MEMBER_READ", "LOAN_READ", "REPORT_READ", "AI_DISCOVER"],
};

export const StaffStatus = z.enum(["ACTIVE", "DISABLED"]);

export const MeSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  fullName: z.string(),
  role: Role,
  permissions: z.array(Permission),
  isDemo: z.boolean(),
});
export type Me = z.infer<typeof MeSchema>;

export const StaffUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  fullName: z.string(),
  role: Role,
  status: StaffStatus,
  isDemo: z.boolean(),
  createdAt: z.string(),
});
export type StaffUser = z.infer<typeof StaffUserSchema>;
export const StaffUserUpdateSchema = z.object({ role: Role, status: StaffStatus });

/** POST /api/auth/demo-login (only when DEMO_ACCOUNTS_ENABLED). Wrong email or password → one generic 401. */
export const DemoLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});
export type DemoLogin = z.infer<typeof DemoLoginSchema>;
