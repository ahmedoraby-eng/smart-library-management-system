import { AppError } from "../errors";

/**
 * Small fixed-window limiter, per isolate. Good enough for a demo-sized app and for unit tests;
 * a Workers Rate Limiting binding can replace it behind the same function.
 */
export class RateLimiter {
  private readonly hits = new Map<string, { windowStart: number; count: number }>();
  constructor(private readonly limit: number, private readonly windowMs: number, private readonly now: () => number = Date.now) {}

  check(key: string): void {
    const t = this.now();
    const e = this.hits.get(key);
    if (!e || t - e.windowStart >= this.windowMs) {
      this.hits.set(key, { windowStart: t, count: 1 });
      return;
    }
    e.count++;
    if (e.count > this.limit) {
      const retryAfter = Math.max(1, Math.ceil((e.windowStart + this.windowMs - t) / 1000));
      throw new RateLimitedError(retryAfter);
    }
  }
}

export class RateLimitedError extends AppError {
  constructor(readonly retryAfterSeconds: number) {
    super(429, "RATE_LIMITED", "Too many requests", `Try again in ${retryAfterSeconds} seconds.`);
  }
}
