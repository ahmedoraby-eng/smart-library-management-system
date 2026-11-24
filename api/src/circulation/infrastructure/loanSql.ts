import { sql, type SQL } from "drizzle-orm";

/**
 * The one derivation of loan status (architecture §3.1). The list filter, each row's `status` and any
 * other count of overdue loans (dashboard, SLM-12) use these fragments, so they can't disagree.
 * `now` is the injected clock's time, passed as a parameter. Expects the loans table aliased as `l`.
 */
export const isOverdueSql = (now: Date): SQL => sql`(l.returned_at IS NULL AND l.due_at < ${now.toISOString()}::timestamptz)`;

export const loanStatusSql = (now: Date): SQL =>
  sql`CASE WHEN l.returned_at IS NOT NULL THEN 'RETURNED' WHEN ${isOverdueSql(now)} THEN 'OVERDUE' ELSE 'ACTIVE' END`;
