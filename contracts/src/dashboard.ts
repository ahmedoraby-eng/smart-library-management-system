import { z } from "zod";
import { LoanStatus } from "./loans";

/** GET /api/dashboard/summary (REPORT_READ). A read model: nothing here is stored; archived books are excluded from every count. */
export const DashboardKpisSchema = z.object({
  totalTitles: z.number().int(),
  totalCopies: z.number().int(),
  availableCopies: z.number().int(),
  borrowedCopies: z.number().int(), // invariant: availableCopies + borrowedCopies = totalCopies
  activeMembers: z.number().int(),
  inactiveMembers: z.number().int(),
  activeLoans: z.number().int(),
  overdueLoans: z.number().int(), // returned_at IS NULL AND due_at < now()
});

export const DashboardRecentLoanSchema = z.object({
  id: z.string(),
  status: LoanStatus,
  book: z.object({ id: z.string(), title: z.string(), author: z.string() }),
  member: z.object({ id: z.string(), memberNumber: z.string(), fullName: z.string() }),
  borrowedAt: z.string(),
  dueAt: z.string(),
});

export const DashboardBookSchema = z.object({
  id: z.string(),
  title: z.string(),
  author: z.string(),
  coverImageUrl: z.string().nullable(),
  totalCopies: z.number().int(),
  availableCopies: z.number().int(),
  nextDueAt: z.string().nullable(),
});

export const DashboardSummarySchema = z.object({
  kpis: DashboardKpisSchema,
  recentBorrowings: z.array(DashboardRecentLoanSchema), // last 8 loans
  popularBooks: z.array(DashboardBookSchema.extend({ loansLast30Days: z.number().int() })), // top 5
  recentlyAdded: z.array(DashboardBookSchema.extend({ createdAt: z.string() })), // last 3
});
export type DashboardSummary = z.infer<typeof DashboardSummarySchema>;
export type DashboardRecentLoan = z.infer<typeof DashboardRecentLoanSchema>;
