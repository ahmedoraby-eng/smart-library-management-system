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
  items: z.array(
    z.object({
      book: DiscoveryBookSchema,
      reason: z.string(), // plain text, at most 300 characters
      matchedTerms: z.array(z.string()),
      foundBy: FoundBy.optional(),
    }),
  ),
  /** SLM-16: "hybrid" = full-text + vector fused; "lexical" = full-text only (embeddings off or failed). */
  retrieval: z.enum(["hybrid", "lexical"]).optional(),
  /** Why the model wasn't used (FALLBACK only), e.g. SINGLE_CANDIDATE, QUOTA_EXCEEDED, BUDGET_EXHAUSTED. */
  fallbackReason: z.string().optional(),
  /** SLM-16 cost control: this ranking came from the result cache (books re-read from the catalog). */
  cached: z.boolean().optional(),
  /**
   * SLM-16 cost tier: 1 = hybrid retrieval + AI ranking with reasons; 2 = hybrid retrieval ranked by RRF,
   * no AI ranking (the user's daily AI searches are used up); 3 = keyword retrieval, deterministic ranking.
   */
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  /** The caller's AI searches left today (UTC), after this request. */
  aiSearches: z.object({ left: z.number().int(), limit: z.number().int() }).optional(),
  note: z.string().nullable(), // fallback notice, "no match" text, or the model's own remark (plain text)
});
export type DiscoveryResponse = z.infer<typeof DiscoveryResponseSchema>;
export type DiscoveryItem = DiscoveryResponse["items"][number];

/** GET /api/admin/discovery/usage (Admin): today's AI spend against the caps (UTC day). */
export const AiUsageTodaySchema = z.object({
  day: z.string(),
  searches: z.number().int(),
  neurons: z.number(),
  neuronCap: z.number(),
  userQuota: z.number().int(),
  vectorPath: z.enum(["hnsw", "brute-force"]).nullable(),
});
export type AiUsageToday = z.infer<typeof AiUsageTodaySchema>;

/** GET /api/ai/quota (AI_DISCOVER): the caller's AI searches left today (UTC). */
export const AiQuotaSchema = z.object({ left: z.number().int(), limit: z.number().int() });
export type AiQuota = z.infer<typeof AiQuotaSchema>;
