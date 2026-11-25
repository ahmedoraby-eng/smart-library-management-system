import { z } from "zod";
import { pageQuery } from "./common";

export const MemberStatus = z.enum(["ACTIVE", "INACTIVE"]);
export type MemberStatus = z.infer<typeof MemberStatus>;

/** Members are library patrons, never users: no password, login or role (SLM-3 AC6). */
export const MemberDtoSchema = z.object({
  id: z.string(),
  memberNumber: z.string(), // M-000123
  fullName: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  status: MemberStatus,
  registeredAt: z.string(),
  activeLoans: z.number().int(), // open loans (returnedAt null), overdue ones included
  overdueLoans: z.number().int(), // open loans past their due date (derived, never stored)
  version: z.number().int(),
});
export type MemberDto = z.infer<typeof MemberDtoSchema>;

/** Field rules and messages follow ux.md §3.5 (the modal shows these next to each field). */
export const MemberInputSchema = z.object({
  fullName: z
    .string({ error: "Enter the member's full name." })
    .trim()
    .min(1, "Enter the member's full name.")
    .max(200, "Keep the name under 200 characters."),
  email: z
    .string({ error: "Enter the member's email address." })
    .trim()
    .min(1, "Enter the member's email address.")
    .max(254, "Keep the email under 254 characters.")
    .toLowerCase()
    .email("Enter a valid email address."),
  phone: z
    .string()
    .trim()
    .max(40, "Enter a valid phone number.")
    .regex(/^[+\d\s()-]*$/, "Enter a valid phone number.")
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
});
export type MemberInput = z.infer<typeof MemberInputSchema>;
export type MemberInputRaw = z.input<typeof MemberInputSchema>;

/** PUT body: the four fields + status (deactivate / reactivate) + the version the form was loaded with. */
export const MemberUpdateSchema = MemberInputSchema.extend({ status: MemberStatus, version: z.number().int().min(0) });
export type MemberUpdate = z.infer<typeof MemberUpdateSchema>;

export const MEMBER_SORT_KEYS = ["fullName", "memberNumber", "registeredAt"] as const;
export type MemberSortKey = (typeof MEMBER_SORT_KEYS)[number];

/** List/search params, shared by the API and the Members route's validateSearch. `ALL` = no status filter. */
export const MemberListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ALL"]).optional(),
  sort: z.string().max(80).optional(), // e.g. "fullName" or "-registeredAt"; keys whitelisted by the API
  ...pageQuery,
});
export type MemberListQuery = z.infer<typeof MemberListQuerySchema>;
