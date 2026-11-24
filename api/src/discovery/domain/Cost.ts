/**
 * SLM-16 cost controls: Workers AI price in Neurons, and the ports that keep spending bounded.
 * Rates from developers.cloudflare.com/workers-ai/platform/pricing (Yousef, read 25/11/2026).
 * The free allowance is 10,000 Neurons a day; our cap stays under it (config AI_DAILY_NEURON_CAP).
 */
export const NEURONS_PER_M_TOKENS: Record<string, { input: number; output: number }> = {
  "@cf/meta/llama-3.2-3b-instruct": { input: 4625, output: 30475 },
  "@cf/baai/bge-base-en-v1.5": { input: 6058, output: 0 },
  "@cf/baai/bge-m3": { input: 1075, output: 0 },
};
/** Unknown model (or a fake one in tests): price it like the ranking model, so caps still bite. */
const DEFAULT_RATE = { input: 4625, output: 30475 };

/** Worst case for one ranking call (≈1,700 input + 600 output tokens); charged when no usage is known (timeout). */
export const WORST_CASE_RANK_NEURONS = 26;

export interface TokenUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** True when counted from text length rather than reported by the model. */
  estimated: boolean;
}

/** Rough tokens for English text when the model reports none (≈ 4 characters a token). */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

export function neuronsFor(u: TokenUsage): number {
  const rate = NEURONS_PER_M_TOKENS[u.model] ?? DEFAULT_RATE;
  return (u.inputTokens * rate.input + u.outputTokens * rate.output) / 1_000_000;
}

/** Cache key form of a request: case, spacing and edge punctuation don't make a new request. */
export function normaliseQuery(q: string): string {
  return q.toLowerCase().normalize("NFKC").replace(/\s+/g, " ").trim().replace(/^[\p{P}\s]+|[\p{P}\s]+$/gu, "");
}

export type BudgetVerdict = "OK" | "QUOTA_EXCEEDED" | "BUDGET_EXHAUSTED";

export interface UsageToday {
  day: string; // UTC, YYYY-MM-DD
  searches: number;
  neurons: number;
  neuronCap: number;
  userQuota: number;
}

/** Daily AI budget: a global Neuron cap and a per-user quota of AI searches. Counters reset each UTC day. */
export interface AiBudget {
  /** Counts one AI search for this user, atomically; refuses past the user's quota or the global cap. */
  reserveSearch(userId: string): Promise<BudgetVerdict>;
  /** False once today's Neurons reached the cap (query embeddings stop too). */
  underCap(): Promise<boolean>;
  /** Adds spent Neurons (globally, and to the user when given). */
  addNeurons(neurons: number, userId?: string): Promise<void>;
  today(): Promise<UsageToday>;
}

/** Small TTL key/value store for query embeddings and ranked results. */
export interface AiCache {
  get(key: string): Promise<unknown | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
}

export async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
