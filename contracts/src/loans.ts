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

/** Due date window for a custom dueAt, in days from now (architecture §3.3; the default is LOAN_DAYS). */
export const DUE_MIN_DAYS = 1;
export const DUE_MAX_DAYS = 60;

export const LOAN_SORT_KEYS = ["borrowedAt", "dueAt", "returnedAt"] as const;
export type LoanSortKey = (typeof LOAN_SORT_KEYS)[number];

/** A day (YYYY-MM-DD, read as a UTC day) or a full ISO date-time. A day as `to` covers that whole day. */
const dayOrDateTime = z.union([z.iso.date(), z.string().datetime({ offset: true })]);

/**
 * Filter semantics: `ACTIVE` = every open loan (overdue included, as «active loans» on the dashboard and
 * the Return tab count them); `OVERDUE` = open and due before now (the same SQL expression that derives
 * a row's status); `RETURNED` = closed. A row's `status` is always the derived one (ACTIVE | OVERDUE | RETURNED).
 */
export const LoanListQuerySchema = z.object({
  status: LoanStatus.optional(),
  memberId: z.string().uuid().optional(),
  bookId: z.string().uuid().optional(),
  q: z.string().trim().max(200).optional(), // member name/number, book title or ISBN (Return screen, history)
  from: dayOrDateTime.optional(), // borrowedAt ≥ from
  to: dayOrDateTime.optional(), // borrowedAt ≤ to
  sort: z.string().max(80).optional(), // borrowedAt | dueAt | returnedAt, "-" = descending; default per status
  ...pageQuery,
});
export type LoanListQuery = z.infer<typeof LoanListQuerySchema>;
