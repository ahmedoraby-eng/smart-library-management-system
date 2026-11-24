import { z } from "zod";
import { pageQuery } from "./common";

const year = new Date().getUTCFullYear();

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
  activeLoans: z.number().int(),
  nextDueAt: z.string().nullable(),
  hasLoanHistory: z.boolean(),
  archived: z.boolean(),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type BookDto = z.infer<typeof BookDtoSchema>;

const isbn = z
  .string()
  .trim()
  .transform((s) => s.replace(/[-\s]/g, "").toUpperCase())
  .refine((s) => /^(\d{9}[\dX]|\d{13})$/.test(s), "must be a 10- or 13-digit ISBN");

export const BookInputSchema = z.object({
  title: z.string().trim().min(1, "is required").max(300),
  author: z.string().trim().min(1, "is required").max(200),
  isbn: isbn.nullable().optional().transform((v) => v ?? null),
  description: z.string().trim().max(4000).default(""),
  category: z.string().trim().min(1, "is required").max(80),
  publisher: z.string().trim().max(200).default(""),
  publicationYear: z.number().int().min(1450).max(year + 1).nullable().optional().transform((v) => v ?? null),
  coverImageUrl: z.string().trim().url().max(1000).nullable().optional().transform((v) => v ?? null),
  totalCopies: z.number().int().min(0).max(10_000),
});
export type BookInput = z.infer<typeof BookInputSchema>;

export const BookUpdateSchema = BookInputSchema.extend({ version: z.number().int().min(0) });
export type BookUpdate = z.infer<typeof BookUpdateSchema>;

export const BookSortKeys = ["title", "author", "createdAt", "publicationYear", "availableCopies", "relevance"] as const;
export const BookListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  category: z.string().trim().max(80).optional(),
  available: z.enum(["true", "false"]).optional(),
  sort: z.string().optional(), // e.g. "title,-createdAt"; keys whitelisted by the API
  ...pageQuery,
});
export type BookListQuery = z.infer<typeof BookListQuerySchema>;

export const BookDeleteResultSchema = z.object({ result: z.enum(["archived", "deleted"]) });
