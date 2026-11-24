import { z } from "zod";

/** POST /api/ai/book-discovery (AI_DISCOVER). Rate limit: 10 per minute per staff user (429 + Retry-After). */
export const DiscoveryRequestSchema = z.object({
  query: z
    .string({ error: "Describe what the member needs." })
    .trim()
    .min(3, "Describe what the member needs (at least 3 characters).")
    .max(500, "Keep it under 500 characters."),
  memberId: z.string().uuid().optional(), // only the titles of this member's last 5 loans leave the server
  limit: z.number().int().min(1).max(5).optional(), // default 5
  availableOnly: z.boolean().optional(),
});
export type DiscoveryRequest = z.infer<typeof DiscoveryRequestSchema>;

/** Always read from the catalog, never from the model. */
export const DiscoveryBookSchema = z.object({
  id: z.string(),
  title: z.string(),
  author: z.string(),
  category: z.string(),
  publicationYear: z.number().int().nullable(),
  coverImageUrl: z.string().nullable(),
  availableCopies: z.number().int(),
  totalCopies: z.number().int(),
  nextDueAt: z.string().nullable(),
});

export const DiscoveryMode = z.enum(["AI", "FALLBACK"]);

/** SLM-16: which retriever surfaced the book. "related" = topped up from a nearby category. */
export const FoundBy = z.enum(["lexical", "semantic", "both", "related"]);
export type FoundBy = z.infer<typeof FoundBy>;

export const DiscoveryResponseSchema = z.object({
  mode: DiscoveryMode,
  items: z.array(z.object({
    book: DiscoveryBookSchema,
    reason: z.string(), // plain text, at most 300 characters
    matchedTerms: z.array(z.string()),
    foundBy: FoundBy.optional(),
  })),
  /** SLM-16: "hybrid" = full-text + vector fused; "lexical" = full-text only (embeddings off or failed). */
  retrieval: z.enum(["hybrid", "lexical"]).optional(),
  note: z.string().nullable(), // fallback notice, "no match" text, or the model's own remark (plain text)
});
export type DiscoveryResponse = z.infer<typeof DiscoveryResponseSchema>;
export type DiscoveryItem = DiscoveryResponse["items"][number];
