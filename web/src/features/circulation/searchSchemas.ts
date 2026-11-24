import { LoanListQuerySchema, LoanStatus } from "@slm/contracts";
import { z } from "zod";

/** /circulation/borrow?member=&book= — prefilled from a book row, book detail, member detail or AI result. */
export const BorrowSearchSchema = z.object({
  member: z.string().uuid().optional().catch(undefined),
  book: z.string().uuid().optional().catch(undefined),
});
export type BorrowSearch = z.infer<typeof BorrowSearchSchema>;

/** /circulation/return?q=&page= */
export const ReturnSearchSchema = z.object({
  q: z.string().trim().max(200).optional().catch(undefined),
  page: z.coerce.number().int().min(1).default(1).catch(1),
});
export type ReturnSearch = z.infer<typeof ReturnSearchSchema>;

/**
 * /loans — the API's own query schema, so the URL is the filter state. `status` is case-insensitive
 * (the dashboard links to ?status=overdue); bad values are dropped rather than failing the page.
 */
export const LoanHistorySearchSchema = LoanListQuerySchema.extend({
  status: z.preprocess((v) => (typeof v === "string" ? v.toUpperCase() : v), LoanStatus.optional()).catch(undefined),
});
export type LoanHistorySearch = z.infer<typeof LoanHistorySearchSchema>;
