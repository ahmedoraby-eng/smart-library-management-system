import { z } from "zod";
import { pageQuery } from "./common";

/** OVERDUE is derived at read time (returnedAt null and dueAt < now); never stored. */
export const LoanStatus = z.enum(["ACTIVE", "OVERDUE", "RETURNED"]);
export type LoanStatus = z.infer<typeof LoanStatus>;

const ref = z.object({ id: z.string(), name: z.string() });

export const LoanDtoSchema = z.object({
  id: z.string(),
  status: LoanStatus,
  book: z.object({ id: z.string(), title: z.string(), author: z.string() }),
  member: z.object({ id: z.string(), memberNumber: z.string(), fullName: z.string() }),
  processedBy: ref,
  returnedBy: ref.nullable(),
  borrowedAt: z.string(),
  dueAt: z.string(),
  returnedAt: z.string().nullable(),
});
export type LoanDto = z.infer<typeof LoanDtoSchema>;

export const BorrowInputSchema = z.object({
  bookId: z.string().uuid(),
  memberId: z.string().uuid(),
  dueAt: z.string().datetime({ offset: true }).optional(), // default: now + LOAN_DAYS; allowed 1–60 days
});
export type BorrowInput = z.infer<typeof BorrowInputSchema>;

export const LoanListQuerySchema = z.object({
  status: LoanStatus.optional(),
  memberId: z.string().uuid().optional(),
  bookId: z.string().uuid().optional(),
  q: z.string().trim().max(200).optional(), // member name/number or book title, for the Return screen
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  sort: z.string().optional(),
  ...pageQuery,
});
