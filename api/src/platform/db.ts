import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool, PoolClient, Client } from "pg";

export type Db = NodePgDatabase<Record<string, never>>;
/** A Drizzle handle bound to one transaction. Repositories accept Db | Tx alike. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

export function createDb(client: Pool | PoolClient | Client): Db {
  return drizzle({ client });
}

/** Postgres SQLSTATE codes we translate into domain errors (one place: infrastructure). */
export const PgCode = {
  uniqueViolation: "23505",
  checkViolation: "23514",
  foreignKeyViolation: "23503",
} as const;

export function pgError(err: unknown): { code: string; constraint?: string } | null {
  let e: unknown = err;
  // Drizzle wraps driver errors; walk the cause chain.
  for (let i = 0; i < 4 && e; i++) {
    const o = e as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (typeof o.code === "string" && /^[0-9A-Z]{5}$/.test(o.code)) {
      return { code: o.code, ...(typeof o.constraint === "string" ? { constraint: o.constraint } : {}) };
    }
    e = o.cause;
  }
  return null;
}

type RawClient = { query: (text: string) => Promise<unknown> };
type PoolLike = { connect: () => Promise<RawClient & { release: () => void }> };

/**
 * Runs fn in one transaction on a raw pg connection (simple query protocol), for multi-statement
 * SQL such as the demo seed. Works with both a Pool (tests, scripts) and a single Client (Worker).
 */
export async function inRawTransaction(db: Db, fn: (client: RawClient) => Promise<void>): Promise<void> {
  const underlying = (db as unknown as { $client: RawClient | PoolLike }).$client;
  const isPool = typeof (underlying as { totalCount?: unknown }).totalCount === "number"; // pg.Pool, not pg.Client
  const client = isPool ? await (underlying as PoolLike).connect() : (underlying as RawClient);
  try {
    await client.query("BEGIN");
    try {
      await fn(client);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw e;
    }
  } finally {
    if (isPool) (client as RawClient & { release: () => void }).release();
  }
}
