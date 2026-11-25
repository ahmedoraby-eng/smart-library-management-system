import type { LoanSortKey, LoanStatus } from "@slm/contracts";
import { sql, type SQL } from "drizzle-orm";
import type { Db } from "../../platform/db";
import type { LoanListParams, LoanReader, LoanView } from "../domain/Loan";
import { isOverdueSql, loanStatusSql } from "./loanSql";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Loan read model: loans with book, member and staff names. Other modules' tables are read by name. */
const FROM = sql`FROM loans l
  JOIN books b ON b.id = l.book_id
  JOIN members m ON m.id = l.member_id
  JOIN staff_users ps ON ps.id = l.processed_by
  LEFT JOIN staff_users rs ON rs.id = l.returned_by`;

const select = (now: Date) => sql`SELECT l.id, l.borrowed_at, l.due_at, l.returned_at,
    b.id AS book_id, b.title AS book_title, b.author AS book_author,
    m.id AS member_id, m.member_number, m.full_name AS member_name,
    ps.id AS processed_by_id, ps.full_name AS processed_by_name,
    rs.id AS returned_by_id, rs.full_name AS returned_by_name,
    ${loanStatusSql(now)} AS status
  ${FROM}`;

const SORT_SQL: Record<LoanSortKey, SQL> = {
  borrowedAt: sql`l.borrowed_at`,
  dueAt: sql`l.due_at`,
  returnedAt: sql`l.returned_at`,
};

type Row = Record<string, unknown>;
const date = (v: unknown) => new Date(v as string | Date);

function toView(r: Row): LoanView {
  return {
    id: r.id as string,
    status: r.status as LoanStatus,
    book: { id: r.book_id as string, title: r.book_title as string, author: r.book_author as string },
    member: { id: r.member_id as string, memberNumber: r.member_number as string, fullName: r.member_name as string },
    processedBy: { id: r.processed_by_id as string, name: r.processed_by_name as string },
    returnedBy: r.returned_by_id ? { id: r.returned_by_id as string, name: r.returned_by_name as string } : null,
    borrowedAt: date(r.borrowed_at),
    dueAt: date(r.due_at),
    returnedAt: r.returned_at ? date(r.returned_at) : null,
  };
}

const likeEscape = (q: string) => "%" + q.replace(/[\\%_]/g, (m) => "\\" + m) + "%";

export class PgLoanReader implements LoanReader {
  constructor(private readonly db: Db) {}

  async findView(id: string, now: Date): Promise<LoanView | null> {
    if (!UUID.test(id)) return null;
    const { rows } = await this.db.execute(sql`${select(now)} WHERE l.id = ${id}`);
    return rows[0] ? toView(rows[0]) : null;
  }

  async list(p: LoanListParams, now: Date): Promise<{ items: LoanView[]; total: number }> {
    const where: SQL[] = [];
    // ACTIVE = every open loan (overdue included); OVERDUE = the same expression as the row status.
    if (p.status === "ACTIVE") where.push(sql`l.returned_at IS NULL`);
    if (p.status === "OVERDUE") where.push(isOverdueSql(now));
    if (p.status === "RETURNED") where.push(sql`l.returned_at IS NOT NULL`);
    if (p.memberId) where.push(sql`l.member_id = ${p.memberId}`);
    if (p.bookId) where.push(sql`l.book_id = ${p.bookId}`);
    if (p.from) where.push(sql`l.borrowed_at >= ${p.from.toISOString()}::timestamptz`);
    if (p.to) where.push(sql`l.borrowed_at <= ${p.to.toISOString()}::timestamptz`);
    if (p.q) {
      const like = likeEscape(p.q);
      const isbn = p.q.replace(/[-\s]/g, "").toUpperCase();
      where.push(
        sql`(m.full_name ILIKE ${like} OR m.member_number ILIKE ${like} OR b.title ILIKE ${like} OR b.isbn = ${isbn})`,
      );
    }

    const order: SQL[] = p.sort.map(
      (s) => sql`${SORT_SQL[s.key]} ${s.desc ? sql`DESC NULLS LAST` : sql`ASC NULLS LAST`}`,
    );
    if (!p.sort.length) {
      if (p.status === "ACTIVE" || p.status === "OVERDUE")
        order.push(sql`${isOverdueSql(now)} DESC`, sql`l.due_at ASC`);
      else order.push(sql`l.borrowed_at DESC`);
    }
    order.push(sql`l.id ASC`); // stable paging

    const whereSql = where.length ? sql`WHERE ${sql.join(where, sql` AND `)}` : sql``;
    const [{ rows }, count] = await Promise.all([
      this.db.execute(
        sql`${select(now)} ${whereSql} ORDER BY ${sql.join(order, sql`, `)} LIMIT ${p.size} OFFSET ${(p.page - 1) * p.size}`,
      ),
      this.db.execute(sql`SELECT count(*)::int AS n ${FROM} ${whereSql}`),
    ]);
    return { items: rows.map(toView), total: Number(count.rows[0]?.n ?? 0) };
  }
}
