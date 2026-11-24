import { MAX_CANDIDATES, type Candidate, type CatalogRetrieval, type DiscoveryBook, type Embedder, type LexicalRetrieval, type RetrievalMode } from "../domain/Discovery";
import { reciprocalRankFusion } from "../domain/Fusion";
import type { ChunkStore } from "../domain/Indexing";

/** The query embedding plus the vector query must finish within this, or retrieval is full-text only. */
export const SEMANTIC_TIMEOUT_MS = 1500;
const MIN_HITS = 5;

export type SemanticFallbackReason = "NO_EMBEDDER" | "TIMEOUT" | "EMBEDDING_ERROR";
export type RetrievalLog = (entry: { retrieval: RetrievalMode; lexical: number; semantic: number; both: number; fallbackReason: SemanticFallbackReason | null; latencyMs: number }) => void;

class SemanticTimeout extends Error {}

/**
 * SLM-16 hybrid retrieval. Full-text (PgCatalogRetrieval) and vector search over `book_chunks` run in
 * parallel; their rankings are fused with Reciprocal Rank Fusion (k = 60) into at most 20 candidates,
 * each marked with the retriever that found it. Vector trouble of any kind (no AI binding, an error,
 * a slow model) leaves full-text only: discovery never breaks because of embeddings.
 */
export class HybridCatalogRetrieval implements CatalogRetrieval {
  private mode: RetrievalMode = "lexical";

  constructor(
    private readonly lexical: LexicalRetrieval,
    private readonly chunks: ChunkStore | null,
    private readonly embedder: Embedder | null,
    private readonly log: RetrievalLog = () => undefined,
    private readonly timeoutMs = SEMANTIC_TIMEOUT_MS,
  ) {}

  lastMode(): RetrievalMode {
    return this.mode;
  }

  async candidates(query: string, opts: { limit: number; availableOnly: boolean }): Promise<Candidate[]> {
    const started = Date.now();
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
      const extra = await this.lexical.byIds(semantic.ids.filter((i) => !known.has(i)), query, opts);
      const byId = new Map([...hits, ...extra].map((c) => [c.id, c]));
      const semanticList = semantic.ids.flatMap((i) => byId.get(i) ?? []);
      fused = reciprocalRankFusion(hits, semanticList, (c) => c.id, limit).map((f) => ({ ...f.item, score: f.score, foundBy: f.foundBy }));
    }

    if (fused.length < Math.min(MIN_HITS, limit)) {
      const more = await this.lexical.topUp(query, fused, { ...opts, limit });
      fused.push(...more.map((c) => ({ ...c, foundBy: "related" as const })));
    }

    const count = (f: Candidate["foundBy"]) => fused.filter((c) => c.foundBy === f).length;
    this.log({
      retrieval: this.mode, lexical: count("lexical"), semantic: count("semantic"), both: count("both"),
      fallbackReason: semantic.ok ? null : semantic.reason, latencyMs: Date.now() - started,
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
  private async semanticIds(query: string, opts: { limit: number; availableOnly: boolean }):
    Promise<{ ok: true; ids: string[] } | { ok: false; reason: SemanticFallbackReason }> {
    const { embedder, chunks } = this;
    if (!embedder || !chunks) return { ok: false, reason: "NO_EMBEDDER" };
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { abort.abort(); reject(new SemanticTimeout()); }, this.timeoutMs);
    });
    try {
      const work = (async () => {
        const [vector] = await embedder.embed([`${embedder.queryPrefix}${query}`], abort.signal);
        if (!vector) throw new Error("no vector");
        return chunks.nearest(vector, { model: embedder.model, limit: opts.limit, minSimilarity: embedder.minSimilarity, availableOnly: opts.availableOnly });
      })();
      work.catch(() => undefined); // a late failure after the timeout must not surface as unhandled
      const hits = await Promise.race([work, timeout]);
      return { ok: true, ids: hits.map((h) => h.bookId) };
    } catch (e) {
      return { ok: false, reason: e instanceof SemanticTimeout ? "TIMEOUT" : "EMBEDDING_ERROR" };
    } finally {
      clearTimeout(timer);
    }
  }
}
