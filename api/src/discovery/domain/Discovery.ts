import type { DiscoveryBookSchema } from "@slm/contracts";
import type { z } from "zod";

export type DiscoveryBook = z.infer<typeof DiscoveryBookSchema>;

/** One catalog book offered to the ranker. `score` and `matchedTerms` come from retrieval, never from a model. */
export interface Candidate {
  id: string;
  title: string;
  author: string;
  category: string;
  publicationYear: number | null;
  description: string; // already cut to 200 characters
  score: number;
  matchedTerms: string[];
  /** True when the book was added from a related category rather than matched on the query. */
  related: boolean;
}

/** The catalog is the source of truth: candidates, fresh availability and the member's recent titles all come from it. */
export interface CatalogRetrieval {
  /** At most `limit` non-archived books, best first. Tops up from related categories when fewer than 5 match. */
  candidates(query: string, opts: { limit: number; availableOnly: boolean }): Promise<Candidate[]>;
  /** Fresh title, author, availability... for these ids (archived or missing ids are absent from the result). */
  summaries(ids: string[]): Promise<Map<string, DiscoveryBook>>;
  /** Titles only of the member's last `limit` loans (no names, no email). */
  recentLoanTitles(memberId: string, limit: number): Promise<string[]>;
}

export interface RankRequest {
  query: string;
  candidates: Candidate[];
  memberRecentTitles: string[];
  signal: AbortSignal;
}

/**
 * Port to a ranking model. The output is untrusted: it is returned as received (an object or a JSON
 * string) and only RecommendationValidator decides what survives. Implementations may throw.
 */
export interface AiProvider {
  readonly name: string;
  rank(request: RankRequest): Promise<unknown>;
}

export const MAX_ITEMS = 5;
export const MAX_REASON_LENGTH = 300;
export const MAX_CANDIDATES = 20;
export const MEMBER_CONTEXT_LOANS = 5;
