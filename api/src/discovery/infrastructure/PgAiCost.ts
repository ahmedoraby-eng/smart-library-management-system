import { sql } from "drizzle-orm";
import type { Clock } from "../../platform/clock";
import type { Db } from "../../platform/db";
import type { AiBudget, AiCache, BudgetVerdict, UsageToday } from "../domain/Cost";

const GLOBAL = "global";
const userScope = (id: string) => `user:${id}`;
const utcDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * `ai_usage` (migration 0005): one row per UTC day for the global Neuron total, one per user for the
 * search quota. Increments are single upserts, so concurrent requests can't both take the last slot
 * of a user's quota. The global cap is checked before the call and charged after it, so a burst can
 * overshoot by a few calls' worth (≤ 26 Neurons each); the cap sits at 80 % of the free 10k for that.
 */
export class PgAiBudget implements AiBudget {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly neuronCap: number,
    private readonly userQuota: number,
  ) {}

  private day() {
    return utcDay(this.clock());
  }

  async underCap(): Promise<boolean> {
    const { rows } = await this.db.execute(
      sql`SELECT neurons FROM ai_usage WHERE day = ${this.day()}::date AND scope = ${GLOBAL}`,
    );
    return Number(rows[0]?.neurons ?? 0) < this.neuronCap;
  }

  async reserveSearch(userId: string): Promise<BudgetVerdict> {
    if (!(await this.underCap())) return "BUDGET_EXHAUSTED";
    const day = this.day();
    // Only increments while under the quota; no row back means the quota is used up.
    const { rows } = await this.db
      .execute(sql`INSERT INTO ai_usage (day, scope, searches) VALUES (${day}::date, ${userScope(userId)}, 1)
      ON CONFLICT (day, scope) DO UPDATE SET searches = ai_usage.searches + 1 WHERE ai_usage.searches < ${this.userQuota}
      RETURNING searches`);
    if (rows.length === 0 || this.userQuota <= 0) return "QUOTA_EXCEEDED";
    await this.db.execute(sql`INSERT INTO ai_usage (day, scope, searches) VALUES (${day}::date, ${GLOBAL}, 1)
      ON CONFLICT (day, scope) DO UPDATE SET searches = ai_usage.searches + 1`);
    return "OK";
  }

  async addNeurons(neurons: number, userId?: string): Promise<void> {
    if (!(neurons > 0)) return;
    const day = this.day();
    const n = neurons.toFixed(3);
    await this.db.execute(sql`INSERT INTO ai_usage (day, scope, neurons) VALUES (${day}::date, ${GLOBAL}, ${n}::numeric)
      ON CONFLICT (day, scope) DO UPDATE SET neurons = ai_usage.neurons + EXCLUDED.neurons`);
    if (userId) {
      await this.db
        .execute(sql`INSERT INTO ai_usage (day, scope, neurons) VALUES (${day}::date, ${userScope(userId)}, ${n}::numeric)
        ON CONFLICT (day, scope) DO UPDATE SET neurons = ai_usage.neurons + EXCLUDED.neurons`);
    }
  }

  async searchesLeft(userId: string): Promise<{ left: number; limit: number }> {
    const { rows } = await this.db.execute(
      sql`SELECT searches FROM ai_usage WHERE day = ${this.day()}::date AND scope = ${userScope(userId)}`,
    );
    return { left: Math.max(this.userQuota - Number(rows[0]?.searches ?? 0), 0), limit: this.userQuota };
  }

  async today(): Promise<UsageToday> {
    const day = this.day();
    const { rows } = await this.db.execute(
      sql`SELECT searches, neurons FROM ai_usage WHERE day = ${day}::date AND scope = ${GLOBAL}`,
    );
    return {
      day,
      searches: Number(rows[0]?.searches ?? 0),
      neurons: Math.round(Number(rows[0]?.neurons ?? 0) * 10) / 10,
      neuronCap: this.neuronCap,
      userQuota: this.userQuota,
    };
  }
}

/** `ai_cache` (migration 0005): TTL rows; expired rows read as misses and are purged by the nightly cron. */
export class PgAiCache implements AiCache {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  async get(key: string): Promise<unknown | null> {
    const { rows } = await this.db.execute(
      sql`SELECT value FROM ai_cache WHERE key = ${key} AND expires_at > ${this.clock().toISOString()}::timestamptz`,
    );
    return rows[0]?.value ?? null;
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const expires = new Date(this.clock().getTime() + ttlSeconds * 1000).toISOString();
    await this.db
      .execute(sql`INSERT INTO ai_cache (key, value, expires_at) VALUES (${key}, ${JSON.stringify(value)}::jsonb, ${expires}::timestamptz)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at`);
  }

  async purgeExpired(): Promise<number> {
    const r = await this.db.execute(
      sql`DELETE FROM ai_cache WHERE expires_at <= ${this.clock().toISOString()}::timestamptz`,
    );
    return r.rowCount ?? 0;
  }
}
