import type { Embedder } from "../domain/Discovery";
import type { AiBinding } from "./WorkersAiProvider";

export const DEFAULT_EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";
const DIMENSIONS: Record<string, number> = {
  "@cf/baai/bge-small-en-v1.5": 384,
  "@cf/baai/bge-base-en-v1.5": 768,
  "@cf/baai/bge-large-en-v1.5": 1024,
};
/** Most texts in one Workers AI call (the model accepts up to 100; smaller batches keep each call quick). */
export const EMBED_BATCH = 50;

/**
 * Workers AI text embeddings through the `AI` binding (no key in code). bge-*-v1.5 returns
 * `{ shape, data: number[][] }`; vectors are normalised here so cosine = dot product everywhere.
 */
export class WorkersAiEmbedder implements Embedder {
  readonly dimensions: number;
  /** bge v1.5: short queries against passages work best with this instruction. */
  readonly queryPrefix = "Represent this sentence for searching relevant passages: ";
  /** Tunable: bge cosine scores sit high; below this a chunk is not about the request. */
  readonly minSimilarity = 0.5;
  constructor(private readonly ai: AiBinding, readonly model: string = DEFAULT_EMBEDDING_MODEL) {
    this.dimensions = DIMENSIONS[model] ?? 768;
  }

  async embed(texts: string[], signal?: AbortSignal): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += EMBED_BATCH) {
      const batch = texts.slice(i, i + EMBED_BATCH);
      const call = this.ai.run(this.model, { text: batch }) as Promise<{ data?: unknown }>;
      const result = signal ? await Promise.race([call, aborted(signal)]) : await call;
      const data = result?.data;
      if (!Array.isArray(data) || data.length !== batch.length) throw new Error("Embedding response has the wrong shape");
      for (const v of data) {
        if (!Array.isArray(v) || v.length !== this.dimensions || !v.every((x) => typeof x === "number" && Number.isFinite(x))) {
          throw new Error("Embedding vector has the wrong size");
        }
        out.push(normalise(v as number[]));
      }
    }
    return out;
  }
}

function aborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) reject(new Error("aborted"));
    signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  });
}

export function normalise(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return n === 0 ? v : v.map((x) => x / n);
}
