import type { DiscoveryRequest, DiscoveryResponse } from "@slm/contracts";
import { MAX_CANDIDATES, MAX_ITEMS, MEMBER_CONTEXT_LOANS, type AiProvider, type Candidate, type CatalogRetrieval } from "../domain/Discovery";
import { fallbackRank } from "../domain/FallbackRanker";
import { validateRecommendations, type ValidRecommendation } from "../domain/RecommendationValidator";

export const AI_TIMEOUT_MS = 8000;
export const NO_MATCH_NOTE = "No matching books in the catalog.";
const NO_PROVIDER_NOTE = "Basic search mode: AI ranking isn't set up here. Showing keyword matches from the catalog. Every result is a real catalog record.";
const FAILED_NOTE = "AI ranking is unavailable right now. Showing keyword matches from the catalog instead. Every result is a real catalog record.";

export type FallbackReason = "NO_PROVIDER" | "TIMEOUT" | "PROVIDER_ERROR" | "INVALID_OUTPUT" | "NO_VALID_ITEMS";
export type DiscoveryLog = (entry: { mode: "AI" | "FALLBACK"; latencyMs: number; candidates: number; fallbackReason: FallbackReason | null; provider: string | null; dropped: number; retrieval?: "hybrid" | "lexical" }) => void;

class ProviderTimeout extends Error {}

/**
 * SLM-9: describe a need in words, get real catalog books with reasons (architecture §6).
 * The catalog is the source of truth: candidates come from retrieval, the validator keeps only
 * candidate ids, and title, author and availability are re-read from the database. Any provider
 * trouble ends in the deterministic ranking; core library flows never import this module.
 * Logs mode, latency, candidate count and fallback reason, never the request text.
 */
export class BookDiscoveryService {
  constructor(
    private readonly catalog: CatalogRetrieval,
    private readonly provider: AiProvider | null,
    private readonly log: DiscoveryLog = () => undefined,
    private readonly timeoutMs: number = AI_TIMEOUT_MS,
  ) {}

  async discover(input: DiscoveryRequest): Promise<DiscoveryResponse> {
    const started = Date.now();
    const limit = Math.min(input.limit ?? MAX_ITEMS, MAX_ITEMS);
    const candidates = await this.catalog.candidates(input.query, { limit: MAX_CANDIDATES, availableOnly: input.availableOnly ?? false });

    const finish = async (
      mode: "AI" | "FALLBACK", picks: ValidRecommendation[], note: string | null,
      fallbackReason: FallbackReason | null, dropped = 0,
    ): Promise<DiscoveryResponse> => {
      const books = await this.catalog.summaries(picks.map((p) => p.candidate.id)); // availability: always fresh from the DB
      const items = picks.flatMap((p) => {
        const book = books.get(p.candidate.id);
        return book ? [{ book, reason: p.reason, matchedTerms: p.candidate.matchedTerms, ...(p.candidate.foundBy ? { foundBy: p.candidate.foundBy } : {}) }] : [];
      });
      const retrieval = this.catalog.lastMode?.();
      this.log({ mode, latencyMs: Date.now() - started, candidates: candidates.length, fallbackReason, provider: this.provider?.name ?? null, dropped, ...(retrieval ? { retrieval } : {}) });
      return { mode, items, note: items.length === 0 ? note ?? NO_MATCH_NOTE : note, ...(retrieval ? { retrieval } : {}) };
    };

    if (candidates.length === 0) return finish(this.provider ? "AI" : "FALLBACK", [], NO_MATCH_NOTE, null);
    if (!this.provider) return finish("FALLBACK", fallbackRank(candidates, limit), NO_PROVIDER_NOTE, "NO_PROVIDER");

    let raw: unknown;
    try {
      const recent = input.memberId ? await this.catalog.recentLoanTitles(input.memberId, MEMBER_CONTEXT_LOANS) : [];
      raw = await this.rankWithTimeout(this.provider, input.query, candidates, recent);
    } catch (e) {
      return finish("FALLBACK", fallbackRank(candidates, limit), FAILED_NOTE, e instanceof ProviderTimeout ? "TIMEOUT" : "PROVIDER_ERROR");
    }

    const valid = validateRecommendations(raw, candidates, limit);
    if (!valid) return finish("FALLBACK", fallbackRank(candidates, limit), FAILED_NOTE, "INVALID_OUTPUT");
    if (valid.items.length === 0 && valid.dropped > 0) {
      return finish("FALLBACK", fallbackRank(candidates, limit), FAILED_NOTE, "NO_VALID_ITEMS", valid.dropped);
    }
    return finish("AI", valid.items, valid.note, null, valid.dropped);
  }

  private async rankWithTimeout(provider: AiProvider, query: string, candidates: Candidate[], recent: string[]): Promise<unknown> {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { abort.abort(); reject(new ProviderTimeout()); }, this.timeoutMs);
    });
    try {
      return await Promise.race([provider.rank({ query, candidates, memberRecentTitles: recent, signal: abort.signal }), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}
