import { z } from "zod";
import { StaffUserSchema, type StaffUserUpdateSchema } from "./auth";
import { pageQuery } from "./common";

/**
 * /api/staff-users (SLM-8, architecture §4). Identity comes from Google; the Admin changes only
 * role and status. No POST: people appear after their first sign-in (ux.md §3.7, scope D10).
 */
export const StaffUserDtoSchema = StaffUserSchema;
export type StaffUserDto = z.infer<typeof StaffUserDtoSchema>;

/** PUT body: `StaffUserUpdateSchema` in auth.ts ({ role, status }). */
export type StaffUserUpdate = z.infer<typeof StaffUserUpdateSchema>;

/** List params, shared by the API and the Staff users route's validateSearch. Sorted by name; q over name and email. */
export const StaffUserListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  ...pageQuery,
});
export type StaffUserListQuery = z.infer<typeof StaffUserListQuerySchema>;
