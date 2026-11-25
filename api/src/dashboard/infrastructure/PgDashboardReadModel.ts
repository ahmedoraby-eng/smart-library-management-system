import type { DashboardSummary, LoanStatus } from "@slm/contracts";
import { sql } from "drizzle-orm";
import { isOverdueSql, loanStatusSql } from "../../circulation/infrastructure/loanSql";
import type { Clock } from "../../platform/clock";
import type { Db } from "../../platform/db";
import type { DashboardReadModel } from "../domain/Dashboard";

type Row = Record<string, unknown>;
const iso = (v: unknown) => new Date(v as string | Date).toISOString();
const isoOrNull = (v: unknown) => (v ? iso(v) : null);

/**
 * Read model over books, members and loans, read by table name in raw SQL (architecture §2.1: the
 * dashboard owns no tables). OVERDUE comes from circulation's `isOverdueSql(clock())`, the one derivation
 * every screen uses, with the injected clock (no SQL `now()`).
 * Archived books are excluded from counts, popular and recently added; loan history keeps them.
 */
export class PgDashboardReadModel implements DashboardReadModel {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  async summary(): Promise<DashboardSummary> {
    const now = this.clock();
    const [kpis, members, loans, recent, popular, added] = await Promise.all([
      this.db.execute(sql`SELECT count(*)::int AS titles, coalesce(sum(total_copies), 0)::int AS total,
          coalesce(sum(available_copies), 0)::int AS available
        FROM books WHERE archived_at IS NULL`),
      this.db.execute(sql`SELECT count(*) FILTER (WHERE status = 'ACTIVE')::int AS active,
          count(*) FILTER (WHERE status = 'INACTIVE')::int AS inactive FROM members`),
      this.db.execute(sql`SELECT count(*)::int AS active, count(*) FILTER (WHERE ${isOverdueSql(now)})::int AS overdue
        FROM loans l WHERE l.returned_at IS NULL`),
      this.db.execute(sql`SELECT l.id, l.borrowed_at, l.due_at,
          ${loanStatusSql(now)} AS status,
          b.id AS book_id, b.title, b.author, m.id AS member_id, m.member_number, m.full_name
        FROM loans l JOIN books b ON b.id = l.book_id JOIN members m ON m.id = l.member_id
        ORDER BY l.borrowed_at DESC, l.id DESC LIMIT 8`),
      this.db.execute(sql`SELECT b.id, b.title, b.author, b.cover_image_url, b.total_copies, b.available_copies,
          pop.loans_30d, nd.next_due_at
        FROM (SELECT book_id, count(*)::int AS loans_30d FROM loans
               WHERE borrowed_at >= ${now.toISOString()}::timestamptz - interval '30 days' GROUP BY book_id) pop
        JOIN books b ON b.id = pop.book_id AND b.archived_at IS NULL
        LEFT JOIN LATERAL (SELECT min(due_at) AS next_due_at FROM loans WHERE book_id = b.id AND returned_at IS NULL) nd ON true
        ORDER BY pop.loans_30d DESC, lower(b.title) ASC, b.id ASC LIMIT 5`),
      this.db
        .execute(sql`SELECT b.id, b.title, b.author, b.cover_image_url, b.total_copies, b.available_copies, b.created_at,
          nd.next_due_at
        FROM books b
        LEFT JOIN LATERAL (SELECT min(due_at) AS next_due_at FROM loans WHERE book_id = b.id AND returned_at IS NULL) nd ON true
        WHERE b.archived_at IS NULL ORDER BY b.created_at DESC, b.id DESC LIMIT 3`),
    ]);

    const k = kpis.rows[0]!;
    const mem = members.rows[0]!;
    const ln = loans.rows[0]!;
    const total = Number(k.total);
    const available = Number(k.available);
    const bookOf = (r: Row) => ({
      id: r.id as string,
      title: r.title as string,
      author: r.author as string,
      coverImageUrl: (r.cover_image_url as string | null) ?? null,
      totalCopies: Number(r.total_copies),
      availableCopies: Number(r.available_copies),
      nextDueAt: isoOrNull(r.next_due_at),
    });

    return {
      kpis: {
        totalTitles: Number(k.titles),
        totalCopies: total,
        availableCopies: available,
        borrowedCopies: total - available,
        activeMembers: Number(mem.active),
        inactiveMembers: Number(mem.inactive),
        activeLoans: Number(ln.active),
        overdueLoans: Number(ln.overdue),
      },
      recentBorrowings: recent.rows.map((r) => {
        return {
          id: r.id as string,
          status: r.status as LoanStatus,
          book: { id: r.book_id as string, title: r.title as string, author: r.author as string },
          member: {
            id: r.member_id as string,
            memberNumber: r.member_number as string,
            fullName: r.full_name as string,
          },
          borrowedAt: iso(r.borrowed_at),
          dueAt: iso(r.due_at),
        };
      }),
      popularBooks: popular.rows.map((r) => ({ ...bookOf(r), loansLast30Days: Number(r.loans_30d) })),
      recentlyAdded: added.rows.map((r) => ({ ...bookOf(r), createdAt: iso(r.created_at) })),
    };
  }
}
