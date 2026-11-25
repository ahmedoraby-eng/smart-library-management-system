import type { TokenUsage } from "./Cost";
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
  /** SLM-16: which retriever found it (lexical, semantic, both; "related" for a category top-up). */
  foundBy?: FoundBy;
}

export type FoundBy = "lexical" | "semantic" | "both" | "related";
export type RetrievalMode = "hybrid" | "lexical";

/** The catalog is the source of truth: candidates, fresh availability and the member's recent titles all come from it. */
export interface CatalogRetrieval {
  /** At most `limit` non-archived books, best first. Tops up from related categories when fewer than 5 match. */
  candidates(query: string, opts: { limit: number; availableOnly: boolean }): Promise<Candidate[]>;
  /** How the last `candidates` call retrieved (hybrid retrieval reports a lexical-only fallback). Optional. */
  lastMode?(): RetrievalMode;
  /** Neurons the last `candidates` call spent (query embedding). Optional. */
  lastNeurons?(): number;
  /** See LexicalRetrieval. Optional: without it, results are not cached. */
  catalogueVersion?(): Promise<string>;
  /** Fresh title, author, availability... for these ids (archived or missing ids are absent from the result). */
  summaries(ids: string[]): Promise<Map<string, DiscoveryBook>>;
  /** Titles only of the member's last `limit` loans (no names, no email). */
  recentLoanTitles(memberId: string, limit: number): Promise<string[]>;
}

/** SLM-16: the full-text retriever, in parts, so hybrid retrieval can fuse it with vector search. */
export interface LexicalRetrieval extends CatalogRetrieval {
  /** Full-text + trigram matches only, best first (no top-up). */
  hits(query: string, opts: { limit: number; availableOnly: boolean }): Promise<Candidate[]>;
  /** Candidates for these book ids (live books only), in the given order. */
  byIds(ids: string[], query: string, opts: { availableOnly: boolean }): Promise<Candidate[]>;
  /** Related-category books not in `have`, to fill up to `limit`. */
  topUp(query: string, have: Candidate[], opts: { limit: number; availableOnly: boolean }): Promise<Candidate[]>;
  /** Changes whenever a live book is added, edited, archived or its stock changes (result-cache key). */
  catalogueVersion(): Promise<string>;
}

export interface RankRequest {
  query: string;
  candidates: Candidate[];
  memberRecentTitles: string[];
  signal: AbortSignal;
  /** Called with the call's token usage (reported by the model, or estimated) for the cost budget. */
  onUsage?: (usage: TokenUsage) => void;
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

/** Port to a text-embedding model (SLM-16). One call embeds a batch; vectors are L2-normalised. May throw. */
export interface Embedder {
  readonly model: string;
  readonly dimensions: number;
  /** Prefix for search queries (bge v1.5 retrieval instruction); "" when the model needs none. */
  readonly queryPrefix: string;
  /** Below this cosine similarity a vector hit is noise for this model. */
  readonly minSimilarity: number;
  embed(texts: string[], signal?: AbortSignal): Promise<number[][]>;
}
