import type { MemberInput, MemberSortKey, MemberStatus } from "@slm/contracts";
import { sql, type SQL } from "drizzle-orm";
import { PgCode, pgError, type Db } from "../../platform/db";
import type {
  MemberListParams,
  MemberLoanView,
  MemberRepository,
  MemberView,
  SaveResult,
  UpdateResult,
} from "../domain/Member";
import { members } from "./schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (m) => "\\" + m);

/**
 * Loan counts per member. A read model over circulation's `loans` table, read by name (not its
 * Drizzle schema) as architecture §4 specifies; derived, never stored. Overdue is derived:
 * not returned and due before now (the same rule as everywhere: ux.md §2 status mapping).
 */
const LOAN_FACTS = sql`LEFT JOIN LATERAL (
    SELECT count(*) FILTER (WHERE l.returned_at IS NULL)::int AS active_loans,
           count(*) FILTER (WHERE l.returned_at IS NULL AND l.due_at < now())::int AS overdue_loans
      FROM loans l WHERE l.member_id = m.id
  ) lf ON true`;

const SELECT_VIEW = sql`SELECT m.id, m.member_number, m.full_name, m.email, m.phone, m.status, m.registered_at, m.version,
    coalesce(lf.active_loans, 0) AS active_loans, coalesce(lf.overdue_loans, 0) AS overdue_loans
  FROM members m ${LOAN_FACTS}`;

const SORT_SQL: Record<MemberSortKey, SQL> = {
  fullName: sql`lower(m.full_name)`,
  memberNumber: sql`m.member_number`,
  registeredAt: sql`m.registered_at`,
};

type Row = Record<string, unknown>;

function toView(r: Row): MemberView {
  return {
    id: r.id as string,
    memberNumber: r.member_number as string,
    fullName: r.full_name as string,
    email: r.email as string,
    phone: (r.phone as string | null) ?? null,
    status: r.status as MemberStatus,
    registeredAt: new Date(r.registered_at as string | Date),
    version: r.version as number,
    activeLoans: Number(r.active_loans ?? 0),
    overdueLoans: Number(r.overdue_loans ?? 0),
  };
}

const iso = (v: unknown) => new Date(v as string | Date);

export class PgMemberRepository implements MemberRepository {
  constructor(private readonly db: Db) {}

  async findView(id: string): Promise<MemberView | null> {
    if (!UUID.test(id)) return null;
    const { rows } = await this.db.execute(sql`${SELECT_VIEW} WHERE m.id = ${id}`);
    return rows[0] ? toView(rows[0]) : null;
  }

  async list(p: MemberListParams): Promise<{ items: MemberView[]; total: number }> {
    const where: SQL[] = [];
    if (p.status) where.push(sql`m.status = ${p.status}`);
    if (p.q) {
      const like = likeEscape(p.q);
      where.push(sql`(
        m.full_name ILIKE ${"%" + like + "%"}
        OR word_similarity(${p.q}, m.full_name) > 0.45
        OR m.member_number ILIKE ${like + "%"}
        OR lower(m.email) LIKE ${likeEscape(p.q.toLowerCase()) + "%"}
      )`);
    }
    const whereSql = where.length ? sql`WHERE ${sql.join(where, sql` AND `)}` : sql``;
    // Ties break on name then id, so paging is stable.
    const order = [
      ...p.sort.map((s) => sql`${SORT_SQL[s.key]} ${s.desc ? sql`DESC` : sql`ASC`}`),
      sql`lower(m.full_name) ASC`,
      sql`m.id ASC`,
    ];
    const [{ rows }, count] = await Promise.all([
      this.db.execute(
        sql`${SELECT_VIEW} ${whereSql} ORDER BY ${sql.join(order, sql`, `)} LIMIT ${p.size} OFFSET ${(p.page - 1) * p.size}`,
      ),
      this.db.execute(sql`SELECT count(*)::int AS n FROM members m ${whereSql}`),
    ]);
    return { items: rows.map(toView), total: Number(count.rows[0]?.n ?? 0) };
  }

  async create(input: MemberInput): Promise<SaveResult> {
    try {
      // member_number and registered_at come from the database defaults.
      const [row] = await this.db
        .insert(members)
        .values({ fullName: input.fullName, email: input.email, phone: input.phone })
        .returning({ id: members.id });
      return { kind: "ok", member: (await this.findView(row!.id))! };
    } catch (e) {
      if (this.isDuplicateEmail(e)) return { kind: "duplicate_email" };
      throw e;
    }
  }

  async update(id: string, version: number, input: MemberInput & { status: MemberStatus }): Promise<UpdateResult> {
    if (!UUID.test(id)) return { kind: "not_found" };
    try {
      const { rows } = await this.db.execute(sql`
        UPDATE members SET full_name = ${input.fullName}, email = ${input.email}, phone = ${input.phone},
          status = ${input.status}, version = version + 1
        WHERE id = ${id} AND version = ${version}
        RETURNING id`);
      if (rows.length) return { kind: "ok", member: (await this.findView(id))! };
    } catch (e) {
      if (this.isDuplicateEmail(e)) return { kind: "duplicate_email" };
      throw e;
    }
    // Explain the 0-row update.
    const { rows } = await this.db.execute(sql`SELECT version FROM members WHERE id = ${id}`);
    return rows[0] ? { kind: "stale" } : { kind: "not_found" };
  }

  async loansOf(memberId: string): Promise<MemberLoanView[] | null> {
    if (!UUID.test(memberId)) return null;
    const found = await this.db.execute(sql`SELECT member_number, full_name FROM members WHERE id = ${memberId}`);
    const m = found.rows[0];
    if (!m) return null;
    // Read model over loans + books + staff_users by name (circulation owns those tables).
    const { rows } = await this.db.execute(sql`
      SELECT l.id, l.borrowed_at, l.due_at, l.returned_at,
             CASE WHEN l.returned_at IS NOT NULL THEN 'RETURNED'
                  WHEN l.due_at < now() THEN 'OVERDUE' ELSE 'ACTIVE' END AS status,
             b.id AS book_id, b.title, b.author,
             p.id AS processed_by_id, p.full_name AS processed_by_name,
             r.id AS returned_by_id, r.full_name AS returned_by_name
        FROM loans l
        JOIN books b ON b.id = l.book_id
        JOIN staff_users p ON p.id = l.processed_by
        LEFT JOIN staff_users r ON r.id = l.returned_by
       WHERE l.member_id = ${memberId}
       ORDER BY (l.returned_at IS NULL AND l.due_at < now()) DESC,  -- open overdue first
                (l.returned_at IS NULL) DESC,                        -- then open
                CASE WHEN l.returned_at IS NULL THEN l.due_at END ASC, -- soonest due first among open
                l.returned_at DESC NULLS LAST, l.id ASC`);
    return rows.map((r) => ({
      id: r.id as string,
      status: r.status as MemberLoanView["status"],
      book: { id: r.book_id as string, title: r.title as string, author: r.author as string },
      member: { id: memberId, memberNumber: m.member_number as string, fullName: m.full_name as string },
      processedBy: { id: r.processed_by_id as string, name: r.processed_by_name as string },
      returnedBy: r.returned_by_id ? { id: r.returned_by_id as string, name: r.returned_by_name as string } : null,
      borrowedAt: iso(r.borrowed_at),
      dueAt: iso(r.due_at),
      returnedAt: r.returned_at ? iso(r.returned_at) : null,
    }));
  }

  private isDuplicateEmail(e: unknown): boolean {
    const pe = pgError(e);
    return pe?.code === PgCode.uniqueViolation && pe.constraint === "members_email_uq";
  }
}
