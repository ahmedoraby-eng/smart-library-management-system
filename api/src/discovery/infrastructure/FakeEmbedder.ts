import type { Embedder } from "../domain/Discovery";
import { normalise } from "./WorkersAiEmbedder";

/**
 * Deterministic stand-in for tests and local runs (AI_FAKE=true; refused in production by config).
 * A hashed bag of words over 768 dimensions, where a small concept table folds related words into one
 * dimension ("losing", "mourning", "grief" → one concept). That is enough to show a synonym-only match
 * end to end; real meaning comes from the Workers AI model in production.
 */
const CONCEPTS: Record<string, string[]> = {
  grief: ["grief", "grieving", "grieve", "mourning", "mourn", "bereavement", "bereaved", "loss", "losing", "lost", "death", "dies", "died", "dying", "passing"],
  parent: ["parent", "parents", "mother", "father", "mum", "mom", "dad", "mothers", "fathers"],
  beginner: ["beginner", "beginners", "novice", "newcomer", "introductory", "introduction", "first", "starting", "junior"],
  calm: ["calm", "stress", "anxiety", "anxious", "mindfulness", "peace", "relax", "relaxing"],
  space: ["space", "cosmos", "universe", "astronomy", "stars", "galaxies", "planets", "astrophysics"],
};
const CONCEPT_OF = new Map(Object.entries(CONCEPTS).flatMap(([c, ws]) => ws.map((w) => [w, c] as const)));
const STOP = new Set(["the", "and", "for", "with", "who", "that", "this", "about", "book", "books", "a", "an", "of", "to", "in", "on", "her", "his", "their", "after", "is", "it", "by", "from", "someone", "something"]);
const DIMS = 768;

function bucket(token: string): number {
  let h = 2166136261; // FNV-1a
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % DIMS;
}

export class FakeEmbedder implements Embedder {
  readonly model = "fake-embedding-v1";
  readonly dimensions = DIMS;
  readonly queryPrefix = "";
  readonly minSimilarity = 0.2;

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => {
      const v = new Array<number>(DIMS).fill(0);
      for (const w of t.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
        if (w.length < 3 || STOP.has(w)) continue;
        const concept = CONCEPT_OF.get(w);
        v[bucket(concept ? `#${concept}` : w)]! += concept ? 2 : 1;
      }
      return normalise(v);
    });
  }
}
