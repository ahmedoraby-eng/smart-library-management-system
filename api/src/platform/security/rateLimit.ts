import { AppError } from "../errors";

/** One limiter interface; production uses the Workers Rate Limiting binding, tests and local runs the in-memory one. */
export interface Limiter {
  check(key: string): Promise<void>;
}

/** The shape of a Cloudflare Workers Rate Limiting binding (`[[ratelimits]]` in wrangler.toml). */
export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export class RateLimitedError extends AppError {
  constructor(readonly retryAfterSeconds: number) {
    super(429, "RATE_LIMITED", "Too many requests", `Try again in ${retryAfterSeconds} seconds.`);
  }
}

/** Shared across isolates and locations by Cloudflare. The binding has a fixed period, which we report as Retry-After. */
export class BindingLimiter implements Limiter {
  constructor(
    private readonly binding: RateLimitBinding,
    private readonly periodSeconds: number,
  ) {}
  async check(key: string): Promise<void> {
    const { success } = await this.binding.limit({ key });
    if (!success) throw new RateLimitedError(this.periodSeconds);
  }
}

/**
 * Fixed-window limiter held in memory. It must live as long as the isolate (created once at module
 * scope, never per request), so it limits per isolate. Used when no binding is configured.
 */
export class MemoryLimiter implements Limiter {
  private readonly hits = new Map<string, { windowStart: number; count: number }>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  async check(key: string): Promise<void> {
    const t = this.now();
    const e = this.hits.get(key);
    if (!e || t - e.windowStart >= this.windowMs) {
      this.hits.set(key, { windowStart: t, count: 1 });
      if (this.hits.size > 10_000) this.prune(t);
      return;
    }
    e.count++;
    if (e.count > this.limit) {
      throw new RateLimitedError(Math.max(1, Math.ceil((e.windowStart + this.windowMs - t) / 1000)));
    }
  }

  private prune(t: number): void {
    for (const [k, v] of this.hits) if (t - v.windowStart >= this.windowMs) this.hits.delete(k);
  }
}

/** Picks the binding when the environment has one, else the long-lived memory fallback. */
export function limiterFor(env: unknown, bindingName: string, fallback: MemoryLimiter, periodSeconds: number): Limiter {
  const binding = (env as Record<string, unknown> | undefined)?.[bindingName] as RateLimitBinding | undefined;
  return binding && typeof binding.limit === "function" ? new BindingLimiter(binding, periodSeconds) : fallback;
}
