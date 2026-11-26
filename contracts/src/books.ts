import { z } from "zod";
import { pageQuery } from "./common";

/** Same shape in lists and details (architecture §4). Derived fields are computed, never stored. */
export const BookDtoSchema = z.object({
  id: z.string(),
  title: z.string(),
  author: z.string(),
  isbn: z.string().nullable(),
  description: z.string(),
  category: z.string(),
  publisher: z.string(),
  publicationYear: z.number().int().nullable(),
  coverImageUrl: z.string().nullable(),
  totalCopies: z.number().int(),
  availableCopies: z.number().int(),
  activeLoans: z.number().int(), // open loans of this title (= totalCopies − availableCopies)
  nextDueAt: z.string().nullable(), // earliest dueAt among open loans; drives «Next copy due back …»
  hasLoanHistory: z.boolean(), // any loan ever; the delete dialog says «archive» vs «delete»
  archived: z.boolean(),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type BookDto = z.infer<typeof BookDtoSchema>;

/** ISBN-10 or ISBN-13 with a valid check digit; hyphens and spaces are allowed and removed. */
export function normalizeIsbn(raw: string): string | null {
  const s = raw.replace(/[-\s]/g, "").toUpperCase();
  if (/^\d{9}[\dX]$/.test(s)) {
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += (s[i] === "X" ? 10 : Number(s[i])) * (10 - i);
    return sum % 11 === 0 ? s : null;
  }
  if (/^\d{13}$/.test(s)) {
    let sum = 0;
    for (let i = 0; i < 13; i++) sum += Number(s[i]) * (i % 2 === 0 ? 1 : 3);
    return sum % 10 === 0 ? s : null;
  }
  return null;
}

const currentYear = () => new Date().getUTCFullYear();
const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .optional()
    .transform((v) => v ?? "");

/** Field rules and messages follow ux.md §3.4 (the form shows these messages next to each field). */
export const BookInputSchema = z.object({
  title: z
    .string({ error: "Enter a title." })
    .trim()
    .min(1, "Enter a title.")
    .max(200, "Keep the title under 200 characters."),
  author: z
    .string({ error: "Enter an author." })
    .trim()
    .min(1, "Enter an author.")
    .max(200, "Keep the author under 200 characters."),
  isbn: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((v, ctx) => {
      if (!v) return null;
      const n = normalizeIsbn(v);
      if (!n) {
        ctx.addIssue({ code: "custom", message: "Enter a valid ISBN-10 or ISBN-13." });
        return z.NEVER;
      }
      return n;
    }),
  category: z
    .string({ error: "Choose or type a category." })
    .trim()
    .min(1, "Choose or type a category.")
    .max(60, "Keep the category under 60 characters."),
  publisher: optionalText(120, "Keep the publisher under 120 characters."),
  publicationYear: z
    .number({ error: `Enter a year between 1450 and ${currentYear()}.` })
    .int(`Enter a year between 1450 and ${currentYear()}.`)
    .refine((y) => y >= 1450 && y <= currentYear(), { message: `Enter a year between 1450 and ${currentYear()}.` })
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  coverImageUrl: z
    .string()
    .trim()
    .max(1000)
    .refine((u) => u === "" || /^https:\/\/[^\s]+$/i.test(u), {
      message: "Enter a full image URL starting with https://.",
    })
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
  description: optionalText(2000, "Keep the description under 2,000 characters."),
  totalCopies: z
    .number({ error: "Enter at least 1 copy." })
    .int("Enter a whole number.")
    .min(1, "Enter at least 1 copy.")
    .max(10_000),
});
export type BookInput = z.infer<typeof BookInputSchema>;
export type BookInputRaw = z.input<typeof BookInputSchema>;

export const BookUpdateSchema = BookInputSchema.extend({ version: z.number().int().min(0) });
export type BookUpdate = z.infer<typeof BookUpdateSchema>;

export const BOOK_SORT_KEYS = ["title", "author", "createdAt", "publicationYear", "availableCopies"] as const;
export type BookSortKey = (typeof BOOK_SORT_KEYS)[number];

/** List/search params. Shared by the API and the Books route's validateSearch (filters live in the URL). */
export const BookListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  category: z.string().trim().max(60).optional(),
  availability: z.enum(["all", "available", "unavailable"]).optional(),
  sort: z.string().max(80).optional(), // e.g. "title" or "-createdAt"; keys whitelisted by the API
  ...pageQuery,
});
export type BookListQuery = z.infer<typeof BookListQuerySchema>;

export const BookDeleteResultSchema = z.object({ result: z.enum(["archived", "deleted"]) });
export type BookDeleteResult = z.infer<typeof BookDeleteResultSchema>;

export const CategoriesSchema = z.object({ items: z.array(z.string()) });

/**
 * SLM-13: how long the API waits for Open Library. The one place to change it.
 * Open Library answered in up to 6.5 s when busy (measured 26/11/2026), so 3 s made "Look up" fail;
 * 8 s is that worst case plus a 1.5 s buffer.
 */
export const ISBN_LOOKUP_TIMEOUT_MS = 8000;
/** The browser waits a little longer than the API, so the API's own "timeout" answer arrives first. */
export const ISBN_LOOKUP_CLIENT_WAIT_MS = ISBN_LOOKUP_TIMEOUT_MS + 2000;

/** GET /api/books/isbn-lookup (SLM-13): suggestions from Open Library to prefill the book form. Never saved by itself. */
export const IsbnLookupQuerySchema = z.object({
  isbn: z
    .string({ error: "Enter a valid ISBN-10 or ISBN-13." })
    .trim()
    .refine((v) => normalizeIsbn(v) !== null, "Enter a valid ISBN-10 or ISBN-13."),
});
export const IsbnLookupBookSchema = z.object({
  title: z.string().nullable(),
  author: z.string().nullable(),
  publisher: z.string().nullable(),
  publicationYear: z.number().int().nullable(),
  description: z.string().nullable(),
  coverImageUrl: z.string().nullable(),
});
export type IsbnLookupBook = z.infer<typeof IsbnLookupBookSchema>;
export const IsbnLookupResultSchema = z.discriminatedUnion("found", [
  z.object({ found: z.literal(true), book: IsbnLookupBookSchema }),
  z.object({ found: z.literal(false), reason: z.enum(["not_found", "timeout", "unavailable"]) }),
]);
export type IsbnLookupResult = z.infer<typeof IsbnLookupResultSchema>;
