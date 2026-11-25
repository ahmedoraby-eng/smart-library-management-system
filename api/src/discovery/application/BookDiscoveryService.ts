import type { DiscoveryRequest, DiscoveryResponse } from "@slm/contracts";
import { neuronsFor, normaliseQuery, sha256, WORST_CASE_RANK_NEURONS, type AiBudget, type AiCache, type TokenUsage } from "../domain/Cost";
import { MAX_CANDIDATES, MAX_ITEMS, MEMBER_CONTEXT_LOANS, type AiProvider, type Candidate, type CatalogRetrieval, type FoundBy } from "../domain/Discovery";
import { fallbackRank } from "../domain/FallbackRanker";
import { validateRecommendations, type ValidRecommendation } from "../domain/RecommendationValidator";

export const AI_TIMEOUT_MS = 8000;
/** Ranked results (ids + reasons, never book data) are reused this long for the same request. */
export const RESULT_CACHE_TTL_SECONDS = 15 * 60;
export const NO_MATCH_NOTE = "No matching books in the catalog.";
const NO_PROVIDER_NOTE = "Basic search mode: AI ranking isn't set up here. Showing keyword matches from the catalog. Every result is a real catalog record.";
const FAILED_NOTE = "AI ranking is unavailable right now. Showing keyword matches from the catalog instead. Every result is a real catalog record.";
export const SINGLE_NOTE = "Only one book in the catalog matches, so it's shown without AI ranking.";
export const quotaNote = (quota: number) =>
  `You've used today's ${quota} AI searches. Results are still matched by meaning, without AI ranking or reasons. More AI searches tomorrow (midnight UTC).`;
/** Quota used up while the vector side is down too: the results are keyword matches, so say so. */
export const quotaKeywordNote = (quota: number) =>
  `You've used today's ${quota} AI searches, and search by meaning is unavailable right now, so results are matched by keywords only. More AI searches tomorrow (midnight UTC).`;
export const BUDGET_NOTE = "Today's AI budget for the library is used up, so results are matched by keywords only. AI search is back at midnight UTC.";

export type FallbackReason =
  | "NO_PROVIDER" | "TIMEOUT" | "PROVIDER_ERROR" | "INVALID_OUTPUT" | "NO_VALID_ITEMS"
  | "SINGLE_CANDIDATE" | "QUOTA_EXCEEDED" | "BUDGET_EXHAUSTED";
export type DiscoveryLog = (entry: {
  mode: "AI" | "FALLBACK"; latencyMs: number; candidates: number; fallbackReason: FallbackReason | null; provider: string | null; dropped: number;
  retrieval?: "hybrid" | "lexical"; cacheHit?: boolean; neurons?: number; neuronsToday?: number;
}) => void;

export interface CostControls {
  cache?: AiCache | null;
  budget?: AiBudget | null;
  userQuota?: number;
}

interface CachedRanking {
  v: 1;
  mode: "AI" | "FALLBACK";
  note: string | null;
  retrieval?: "hybrid" | "lexical";
  picks: Array<{ id: string; reason: string; matchedTerms: string[]; foundBy?: FoundBy }>;
}

class ProviderTimeout extends Error {}

/**
 * SLM-9: describe a need in words, get real catalog books with reasons (architecture §6).
 * The catalog is the source of truth: candidates come from retrieval, the validator keeps only
 * candidate ids, and title, author and availability are re-read from the database. Any provider
 * trouble ends in the deterministic ranking; core library flows never import this module.
 * SLM-16 cost tiers (Ahmed, 25/11): 1 = hybrid retrieval + AI ranking with reasons; 2 = the user's daily
 * AI searches are used up → hybrid retrieval ranked by RRF, no model (≈0.1 Neuron); 3 = the library's
 * daily Neuron budget is used up (embeddings stop too) → keyword retrieval, deterministic ranking.
 * Each ends with a clear note, never an error. Plus a result cache (not for member-specific requests)
 * and no model call for 0 or 1 candidate. Logs mode, latency, candidates, Neurons and reasons, never the request text.
 */
export class BookDiscoveryService {
  constructor(
    private readonly catalog: CatalogRetrieval,
    private readonly provider: AiProvider | null,
    private readonly log: DiscoveryLog = () => undefined,
    private readonly timeoutMs: number = AI_TIMEOUT_MS,
    private readonly cost: CostControls = {},
  ) {}

  async discover(input: DiscoveryRequest, ctx: { userId?: string } = {}): Promise<DiscoveryResponse> {
    const started = Date.now();
    const limit = Math.min(input.limit ?? MAX_ITEMS, MAX_ITEMS);
    const { cache, budget } = this.cost;

    // 1. Result cache. Never for a member: the prompt then holds that member's reading.
    const cacheKey = cache && !input.memberId && this.catalog.catalogueVersion
      ? `rank:${await sha256([normaliseQuery(input.query), input.availableOnly ? 1 : 0, limit, this.provider?.name ?? "none", await this.catalog.catalogueVersion()].join("␟"))}`
      : null;
    if (cacheKey) {
      const hit = await this.fromCache(cacheKey);
      if (hit) {
        this.log({ mode: hit.mode, latencyMs: Date.now() - started, candidates: hit.items.length, fallbackReason: null, provider: this.provider?.name ?? null, dropped: 0, cacheHit: true, neurons: 0, ...(hit.retrieval ? { retrieval: hit.retrieval } : {}) });
        return { ...hit, cached: true, tier: hit.mode === "AI" ? 1 : hit.retrieval === "hybrid" ? 2 : 3, ...(await this.left(ctx.userId)) };
      }
    }

    const candidates = await this.catalog.candidates(input.query, { limit: MAX_CANDIDATES, availableOnly: input.availableOnly ?? false });
    let rankNeurons = 0;

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
      const neurons = Math.round(((this.catalog.lastNeurons?.() ?? 0) + rankNeurons) * 1000) / 1000;
      const neuronsToday = budget ? (await budget.today().catch(() => null))?.neurons : undefined;
      this.log({
        mode, latencyMs: Date.now() - started, candidates: candidates.length, fallbackReason, provider: this.provider?.name ?? null, dropped,
        cacheHit: false, neurons, ...(neuronsToday !== undefined ? { neuronsToday } : {}), ...(retrieval ? { retrieval } : {}),
      });
      // Tier 1 = the model ranked; 2 = no model, hybrid RRF ranking; 3 = no model, keyword ranking.
      const tier = mode === "AI" ? 1 : retrieval === "hybrid" ? 2 : 3;
      const response: DiscoveryResponse = {
        mode, items, note: items.length === 0 ? note ?? NO_MATCH_NOTE : note,
        ...(retrieval ? { retrieval } : {}), ...(fallbackReason ? { fallbackReason } : {}),
        tier, ...(await this.left(ctx.userId)),
      };
      // Only a real AI ranking is worth keeping; fallbacks are free to recompute and may recover.
      if (cacheKey && mode === "AI" && items.length > 0) {
        const value: CachedRanking = { v: 1, mode, note: response.note, ...(retrieval ? { retrieval } : {}), picks: items.map((i) => ({ id: i.book.id, reason: i.reason, matchedTerms: i.matchedTerms, ...(i.foundBy ? { foundBy: i.foundBy } : {}) })) };
        await cache!.set(cacheKey, value, RESULT_CACHE_TTL_SECONDS).catch(() => undefined);
      }
      return response;
    };

    if (candidates.length === 0) return finish(this.provider ? "AI" : "FALLBACK", [], NO_MATCH_NOTE, null);
    if (!this.provider) return finish("FALLBACK", fallbackRank(candidates, limit), NO_PROVIDER_NOTE, "NO_PROVIDER");
    // 2. One candidate: nothing to rank, the model would only add a sentence.
    if (candidates.length === 1) return finish("FALLBACK", fallbackRank(candidates, limit), SINGLE_NOTE, "SINGLE_CANDIDATE");

    // 3. Daily budget: per-user quota of AI searches, then the global Neuron cap.
    if (budget && ctx.userId) {
      const verdict = await budget.reserveSearch(ctx.userId);
      if (verdict === "QUOTA_EXCEEDED") {
        // The note follows the tier actually served: hybrid (tier 2) or keyword-only (embeddings down).
        const quota = this.cost.userQuota ?? 0;
        const note = this.catalog.lastMode?.() === "lexical" ? quotaKeywordNote(quota) : quotaNote(quota);
        return finish("FALLBACK", fallbackRank(candidates, limit), note, verdict);
      }
      if (verdict === "BUDGET_EXHAUSTED") return finish("FALLBACK", fallbackRank(candidates, limit), BUDGET_NOTE, verdict);
    } else if (budget && !(await budget.underCap())) {
      return finish("FALLBACK", fallbackRank(candidates, limit), BUDGET_NOTE, "BUDGET_EXHAUSTED");
    }

    let raw: unknown;
    let usage: TokenUsage | null = null;
    try {
      const recent = input.memberId ? await this.catalog.recentLoanTitles(input.memberId, MEMBER_CONTEXT_LOANS) : [];
      raw = await this.rankWithTimeout(this.provider, input.query, candidates, recent, (u) => { usage = u; });
    } catch (e) {
      rankNeurons = await this.charge(usage, ctx.userId);
      return finish("FALLBACK", fallbackRank(candidates, limit), FAILED_NOTE, e instanceof ProviderTimeout ? "TIMEOUT" : "PROVIDER_ERROR");
    }
    rankNeurons = await this.charge(usage, ctx.userId);

    const valid = validateRecommendations(raw, candidates, limit);
    if (!valid) return finish("FALLBACK", fallbackRank(candidates, limit), FAILED_NOTE, "INVALID_OUTPUT");
    if (valid.items.length === 0 && valid.dropped > 0) {
      return finish("FALLBACK", fallbackRank(candidates, limit), FAILED_NOTE, "NO_VALID_ITEMS", valid.dropped);
    }
    return finish("AI", valid.items, valid.note, null, valid.dropped);
  }

  /** The caller's AI searches left today, for the counter next to the search box. */
  private async left(userId?: string): Promise<{ aiSearches?: { left: number; limit: number } }> {
    if (!userId || !this.cost.budget) return {};
    const q = await this.cost.budget.searchesLeft(userId).catch(() => null);
    return q ? { aiSearches: q } : {};
  }

  /** The caller's AI searches left today (GET /api/ai/quota). */
  async quota(userId: string): Promise<{ left: number; limit: number }> {
    return this.cost.budget ? this.cost.budget.searchesLeft(userId) : { left: this.cost.userQuota ?? 0, limit: this.cost.userQuota ?? 0 };
  }

  /** The call happened, so it costs: the model's own token count, or the worst case when there is none (timeout). */
  private async charge(usage: TokenUsage | null, userId?: string): Promise<number> {
    const neurons = usage ? neuronsFor(usage) : WORST_CASE_RANK_NEURONS;
    await this.cost.budget?.addNeurons(neurons, userId).catch(() => undefined);
    return neurons;
  }

  /** A cached ranking, re-read from the catalogue; a book that's gone (or now unavailable) means a fresh run. */
  private async fromCache(key: string): Promise<(DiscoveryResponse & { retrieval?: "hybrid" | "lexical" }) | null> {
    const value = (await this.cost.cache!.get(key).catch(() => null)) as CachedRanking | null;
    if (!value || value.v !== 1 || !Array.isArray(value.picks) || value.picks.length === 0) return null;
    const books = await this.catalog.summaries(value.picks.map((p) => p.id));
    if (books.size !== value.picks.length) return null;
    return {
      mode: value.mode, note: value.note, ...(value.retrieval ? { retrieval: value.retrieval } : {}),
      items: value.picks.map((p) => ({ book: books.get(p.id)!, reason: p.reason, matchedTerms: p.matchedTerms, ...(p.foundBy ? { foundBy: p.foundBy } : {}) })),
    };
  }

  private async rankWithTimeout(provider: AiProvider, query: string, candidates: Candidate[], recent: string[], onUsage: (u: TokenUsage) => void): Promise<unknown> {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { abort.abort(); reject(new ProviderTimeout()); }, this.timeoutMs);
    });
    try {
      return await Promise.race([provider.rank({ query, candidates, memberRecentTitles: recent, signal: abort.signal, onUsage }), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}
