import {
  MAX_CANDIDATES,
  type Candidate,
  type CatalogRetrieval,
  type DiscoveryBook,
  type Embedder,
  type LexicalRetrieval,
  type RetrievalMode,
} from "../domain/Discovery";
import { estimateTokens, neuronsFor, normaliseQuery, sha256, type AiBudget, type AiCache } from "../domain/Cost";
import { reciprocalRankFusion } from "../domain/Fusion";
import type { ChunkStore } from "../domain/Indexing";

/** The query embedding plus the vector query must finish within this, or retrieval is full-text only. */
export const SEMANTIC_TIMEOUT_MS = 1500;
const MIN_HITS = 5;
/** A query embedding is reused for a day (same normalised text, same model). */
export const QUERY_EMBEDDING_TTL_SECONDS = 24 * 60 * 60;

export type SemanticFallbackReason = "NO_EMBEDDER" | "TIMEOUT" | "EMBEDDING_ERROR" | "BUDGET_EXHAUSTED";
export type RetrievalLog = (entry: {
  retrieval: RetrievalMode;
  lexical: number;
  semantic: number;
  both: number;
  fallbackReason: SemanticFallbackReason | null;
  latencyMs: number;
  embeddingCacheHit: boolean;
  neurons: number;
  topSimilarity: number | null;
  vector: "hnsw" | "brute-force" | "off";
}) => void;

class SemanticTimeout extends Error {}
class OverBudget extends Error {}

/**
 * SLM-16 hybrid retrieval. Full-text (PgCatalogRetrieval) and vector search over `book_chunks` run in
 * parallel; their rankings are fused with Reciprocal Rank Fusion (k = 60) into at most 20 candidates,
 * each marked with the retriever that found it. Vector trouble of any kind (no AI binding, an error,
 * a slow model) leaves full-text only: discovery never breaks because of embeddings.
 */
export class HybridCatalogRetrieval implements CatalogRetrieval {
  private mode: RetrievalMode = "lexical";
  private neurons = 0;

  constructor(
    private readonly lexical: LexicalRetrieval,
    private readonly chunks: ChunkStore | null,
    private readonly embedder: Embedder | null,
    private readonly log: RetrievalLog = () => undefined,
    private readonly timeoutMs = SEMANTIC_TIMEOUT_MS,
    private readonly cost: { cache?: AiCache | null; budget?: AiBudget | null } = {},
  ) {}

  /** Neurons the last `candidates` call spent (the query embedding; 0 on a cache hit). */
  lastNeurons(): number {
    return this.neurons;
  }

  catalogueVersion(): Promise<string> {
    return this.lexical.catalogueVersion();
  }

  lastMode(): RetrievalMode {
    return this.mode;
  }

  async candidates(query: string, opts: { limit: number; availableOnly: boolean }): Promise<Candidate[]> {
    const started = Date.now();
    this.neurons = 0;
    const limit = Math.min(opts.limit, MAX_CANDIDATES);
    const [hits, semantic] = await Promise.all([
      this.lexical.hits(query, { ...opts, limit }),
      this.semanticIds(query, { ...opts, limit }),
    ]);

    let fused: Candidate[];
    if (!semantic.ok) {
      this.mode = "lexical";
      fused = hits.map((c) => ({ ...c, foundBy: "lexical" as const }));
    } else {
      this.mode = "hybrid";
      // Books only the vector side found still need their catalogue fields (and matched words, usually none).
      const known = new Set(hits.map((c) => c.id));
      const extra = await this.lexical.byIds(
        semantic.ids.filter((i) => !known.has(i)),
        query,
        opts,
      );
      const byId = new Map([...hits, ...extra].map((c) => [c.id, c]));
      const semanticList = semantic.ids.flatMap((i) => byId.get(i) ?? []);
      fused = reciprocalRankFusion(hits, semanticList, (c) => c.id, limit).map((f) => ({
        ...f.item,
        score: f.score,
        foundBy: f.foundBy,
      }));
    }

    if (fused.length < Math.min(MIN_HITS, limit)) {
      const more = await this.lexical.topUp(query, fused, { ...opts, limit });
      fused.push(...more.map((c) => ({ ...c, foundBy: "related" as const })));
    }

    const count = (f: Candidate["foundBy"]) => fused.filter((c) => c.foundBy === f).length;
    const vector =
      this.embedder && this.chunks
        ? (await this.chunks.usesPgvector().catch(() => false))
          ? "hnsw"
          : "brute-force"
        : "off";
    this.log({
      retrieval: this.mode,
      lexical: count("lexical"),
      semantic: count("semantic"),
      both: count("both"),
      fallbackReason: semantic.ok ? null : semantic.reason,
      latencyMs: Date.now() - started,
      embeddingCacheHit: semantic.ok && semantic.cacheHit,
      neurons: Math.round(this.neurons * 1000) / 1000,
      topSimilarity: semantic.ok && semantic.top !== null ? Math.round(semantic.top * 1000) / 1000 : null,
      vector,
    });
    return fused;
  }

  summaries(ids: string[]): Promise<Map<string, DiscoveryBook>> {
    return this.lexical.summaries(ids);
  }

  recentLoanTitles(memberId: string, limit: number): Promise<string[]> {
    return this.lexical.recentLoanTitles(memberId, limit);
  }

  /** Nearest books by meaning, or why there are none. Never throws. */
  private async semanticIds(
    query: string,
    opts: { limit: number; availableOnly: boolean },
  ): Promise<
    { ok: true; ids: string[]; cacheHit: boolean; top: number | null } | { ok: false; reason: SemanticFallbackReason }
  > {
    const { embedder, chunks } = this;
    if (!embedder || !chunks) return { ok: false, reason: "NO_EMBEDDER" };
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        abort.abort();
        reject(new SemanticTimeout());
      }, this.timeoutMs);
    });
    try {
      const work = (async () => {
        const { vector, cacheHit } = await this.queryVector(embedder, query, abort.signal);
        const hits = await chunks.nearest(vector, {
          model: embedder.model,
          limit: opts.limit,
          minSimilarity: embedder.minSimilarity,
          availableOnly: opts.availableOnly,
        });
        return { hits, cacheHit };
      })();
      work.catch(() => undefined); // a late failure after the timeout must not surface as unhandled
      const { hits, cacheHit } = await Promise.race([work, timeout]);
      return { ok: true, ids: hits.map((h) => h.bookId), cacheHit, top: hits[0]?.similarity ?? null };
    } catch (e) {
      if (e instanceof OverBudget) return { ok: false, reason: "BUDGET_EXHAUSTED" };
      return { ok: false, reason: e instanceof SemanticTimeout ? "TIMEOUT" : "EMBEDDING_ERROR" };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Exactly one embedding call per new query text; cached by normalised text + model; none past the daily cap. */
  private async queryVector(
    embedder: Embedder,
    query: string,
    signal: AbortSignal,
  ): Promise<{ vector: number[]; cacheHit: boolean }> {
    const { cache, budget } = this.cost;
    const key = `qemb:${await sha256(`${embedder.model}\u241f${normaliseQuery(query)}`)}`;
    const cached = cache ? await cache.get(key).catch(() => null) : null;
    if (Array.isArray(cached) && cached.length === embedder.dimensions)
      return { vector: cached as number[], cacheHit: true };

    if (budget && !(await budget.underCap())) throw new OverBudget();
    const text = `${embedder.queryPrefix}${query}`;
    const [vector] = await embedder.embed([text], signal);
    if (!vector) throw new Error("no vector");
    this.neurons = neuronsFor({
      model: embedder.model,
      inputTokens: estimateTokens(text),
      outputTokens: 0,
      estimated: true,
    });
    await budget?.addNeurons(this.neurons).catch(() => undefined);
    await cache?.set(key, vector, QUERY_EMBEDDING_TTL_SECONDS).catch(() => undefined);
    return { vector, cacheHit: false };
  }
}
