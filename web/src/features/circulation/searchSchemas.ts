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
