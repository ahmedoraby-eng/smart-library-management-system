import type { FoundBy } from "./Discovery";

/** SLM-16: Reciprocal Rank Fusion constant (Cormack et al. 2009). Larger k flattens the head of each list. */
export const RRF_K = 60;

export interface Fused<T> {
  item: T;
  /** Σ 1 / (k + rank) over the lists the item appears in (rank starts at 1). */
  score: number;
  foundBy: Exclude<FoundBy, "related">;
  lexicalRank: number | null;
  semanticRank: number | null;
}

/**
 * Fuse a lexical and a semantic ranking (each best first) by RRF and keep the best `limit`.
 * Rank-based, so the two retrievers' scores never need to be on the same scale.
 * Ties: the better lexical rank first (exact words are easier to explain), then input order.
 * An item that appears in both lists is taken from the lexical list (it carries matched words).
 */
export function reciprocalRankFusion<T>(
  lexical: T[], semantic: T[], key: (t: T) => string, limit: number, k = RRF_K,
): Fused<T>[] {
  const byKey = new Map<string, Fused<T> & { order: number }>();
  let order = 0;
  lexical.forEach((item, i) => {
    const id = key(item);
    if (byKey.has(id)) return; // keep the first occurrence
    byKey.set(id, { item, score: 1 / (k + i + 1), foundBy: "lexical", lexicalRank: i + 1, semanticRank: null, order: order++ });
  });
  semantic.forEach((item, i) => {
    const id = key(item);
    const hit = byKey.get(id);
    if (hit) {
      if (hit.semanticRank !== null) return;
      hit.score += 1 / (k + i + 1);
      hit.semanticRank = i + 1;
      hit.foundBy = hit.lexicalRank !== null ? "both" : "semantic";
      return;
    }
    byKey.set(id, { item, score: 1 / (k + i + 1), foundBy: "semantic", lexicalRank: null, semanticRank: i + 1, order: order++ });
  });
  return [...byKey.values()]
    .sort((a, b) => b.score - a.score || (a.lexicalRank ?? Infinity) - (b.lexicalRank ?? Infinity) || a.order - b.order)
    .slice(0, limit)
    .map(({ order: _order, ...f }) => f);
}

/** Cosine similarity of two vectors of the same length (0 when either is all zeros). */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}
