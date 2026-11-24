import { z } from "zod";
import { pageQuery } from "./common";

export const MemberStatus = z.enum(["ACTIVE", "INACTIVE"]);
export type MemberStatus = z.infer<typeof MemberStatus>;

export const MemberDtoSchema = z.object({
  id: z.string(),
  memberNumber: z.string(), // M-000123
  fullName: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  status: MemberStatus,
  registeredAt: z.string(),
  activeLoans: z.number().int(),
  overdueLoans: z.number().int(),
  version: z.number().int(),
});
export type MemberDto = z.infer<typeof MemberDtoSchema>;

export const MemberInputSchema = z.object({
  fullName: z.string().trim().min(1, "is required").max(200),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().max(40).regex(/^[+\d\s()-]*$/, "must be a phone number").nullable().optional().transform((v) => (v ? v : null)),
});
export type MemberInput = z.infer<typeof MemberInputSchema>;

export const MemberUpdateSchema = MemberInputSchema.extend({ status: MemberStatus, version: z.number().int().min(0) });
export type MemberUpdate = z.infer<typeof MemberUpdateSchema>;

export const MemberListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: MemberStatus.optional(),
  sort: z.string().optional(),
  ...pageQuery,
});
