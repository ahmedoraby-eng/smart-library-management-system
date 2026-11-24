import { z } from "zod";

/** RFC 9457 Problem Details: the one error shape of the API. */
export const ProblemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  code: z.string(),
  detail: z.string().optional(),
  errors: z.array(z.object({ field: z.string(), message: z.string() })).optional(),
  requestId: z.string().optional(),
  /** Extra facts for the UI, e.g. DUPLICATE_ISBN → { bookId, title } of the other book. */
  context: z.record(z.string(), z.unknown()).optional(),
});
export type Problem = z.infer<typeof ProblemSchema>;

export const ErrorCode = {
  VALIDATION_FAILED: "VALIDATION_FAILED",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  FORBIDDEN: "FORBIDDEN",
  NOT_PROVISIONED: "NOT_PROVISIONED",
  USER_DISABLED: "USER_DISABLED",
  NOT_FOUND: "NOT_FOUND",
  BOOK_UNAVAILABLE: "BOOK_UNAVAILABLE",
  ALREADY_BORROWED: "ALREADY_BORROWED",
  LOAN_LIMIT_REACHED: "LOAN_LIMIT_REACHED",
  MEMBER_INACTIVE: "MEMBER_INACTIVE",
  LOAN_ALREADY_RETURNED: "LOAN_ALREADY_RETURNED",
  BOOK_HAS_ACTIVE_LOANS: "BOOK_HAS_ACTIVE_LOANS",
  TOTAL_BELOW_LOANED: "TOTAL_BELOW_LOANED",
  STALE_VERSION: "STALE_VERSION",
  DUPLICATE_ISBN: "DUPLICATE_ISBN",
  DUPLICATE_EMAIL: "DUPLICATE_EMAIL",
  PROTECTED_DEMO_ACCOUNT: "PROTECTED_DEMO_ACCOUNT",
  CANNOT_CHANGE_SELF: "CANNOT_CHANGE_SELF",
  LAST_ADMIN: "LAST_ADMIN",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL: "INTERNAL",
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const pageQuery = {
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(100).default(20),
};

export const pageOf = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ items: z.array(item), page: z.number().int(), size: z.number().int(), total: z.number().int() });
export type Page<T> = { items: T[]; page: number; size: number; total: number };

export const IsoDateTime = z.string(); // ISO-8601 UTC, e.g. 2026-11-25T09:00:00.000Z
export const Uuid = z.string().uuid();
