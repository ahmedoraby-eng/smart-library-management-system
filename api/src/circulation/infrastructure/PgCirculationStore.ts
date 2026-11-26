import { sql } from "drizzle-orm";
import type { BookStock } from "../../catalog/domain/BookStock";
import type { Db, DbOrTx } from "../../platform/db";
import type {
  CirculationStore,
  CirculationTx,
  LoanWriter,
  MemberForLoan,
  NewLoan,
  OpenLoanOfTitle,
  RenewalState,
} from "../domain/Loan";
import { circulationErrorFrom } from "./pgErrors";
import { loans } from "./schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const date = (v: unknown) => new Date(v as string | Date);

/**
 * Member and loan statements of architecture §3.4, bound to one transaction. The `members` and
 * `staff_users` tables are read by name (raw SQL), not through their modules' Drizzle schemas.
 */
class PgLoanWriter implements LoanWriter {
  constructor(private readonly tx: DbOrTx) {}

  async lockMember(memberId: string): Promise<MemberForLoan | null> {
    if (!UUID.test(memberId)) return null;
    const { rows } = await this.tx.execute(
      sql`SELECT id, full_name, status FROM members WHERE id = ${memberId} FOR UPDATE`,
    );
    const m = rows[0];
    return m
      ? { id: m.id as string, fullName: m.full_name as string, status: m.status as MemberForLoan["status"] }
      : null;
  }

  async countOpenLoans(memberId: string): Promise<number> {
    const { rows } = await this.tx.execute(
      sql`SELECT count(*)::int AS n FROM loans WHERE member_id = ${memberId} AND returned_at IS NULL`,
    );
    return Number(rows[0]?.n ?? 0);
  }

  async findOpenLoan(memberId: string, bookId: string): Promise<OpenLoanOfTitle | null> {
    if (!UUID.test(bookId)) return null;
    const { rows } = await this.tx.execute(sql`
      SELECT l.id, l.due_at, b.title FROM loans l JOIN books b ON b.id = l.book_id
       WHERE l.member_id = ${memberId} AND l.book_id = ${bookId} AND l.returned_at IS NULL`);
    const r = rows[0];
    return r ? { loanId: r.id as string, title: r.title as string, dueAt: date(r.due_at) } : null;
  }

  async insert(loan: NewLoan): Promise<string> {
    const [row] = await this.tx.insert(loans).values(loan).returning({ id: loans.id });
    return row!.id;
  }

  async close(loanId: string, staffId: string, at: Date): Promise<{ bookId: string } | null> {
    if (!UUID.test(loanId)) return null;
    const { rows } = await this.tx.execute(sql`
      UPDATE loans SET returned_at = ${at.toISOString()}::timestamptz, returned_by = ${staffId}
       WHERE id = ${loanId} AND returned_at IS NULL
      RETURNING book_id`);
    return rows[0] ? { bookId: rows[0].book_id as string } : null;
  }

  async returnState(loanId: string): Promise<{ returnedAt: Date; returnedByName: string | null } | null> {
    if (!UUID.test(loanId)) return null;
    const { rows } = await this.tx.execute(sql`
      SELECT l.returned_at, s.full_name FROM loans l LEFT JOIN staff_users s ON s.id = l.returned_by WHERE l.id = ${loanId}`);
    const r = rows[0];
    if (!r) return null;
    // A loan that exists but whose close matched 0 rows is returned (the UPDATE guard is returned_at IS NULL).
    return { returnedAt: date(r.returned_at), returnedByName: (r.full_name as string | null) ?? null };
  }

  async renew(loanId: string, staffId: string, at: Date, days: number): Promise<boolean> {
    if (!UUID.test(loanId)) return false;
    // Not overdue = NOT (due_at < at), the complement of isOverdueSql, with the same injected time.
    const { rows } = await this.tx.execute(sql`
      UPDATE loans SET due_at = due_at + make_interval(days => ${days}::int),
                       renewed_at = ${at.toISOString()}::timestamptz, renewed_by = ${staffId}
       WHERE id = ${loanId} AND returned_at IS NULL AND renewed_at IS NULL
         AND due_at >= ${at.toISOString()}::timestamptz
      RETURNING id`);
    return rows.length > 0;
  }

  async renewalState(loanId: string): Promise<RenewalState | null> {
    if (!UUID.test(loanId)) return null;
    const { rows } = await this.tx.execute(sql`
      SELECT l.due_at, l.returned_at, l.renewed_at, s.full_name
        FROM loans l LEFT JOIN staff_users s ON s.id = l.returned_by WHERE l.id = ${loanId}`);
    const r = rows[0];
    if (!r) return null;
    return {
      dueAt: date(r.due_at),
      returnedAt: r.returned_at ? date(r.returned_at) : null,
      returnedByName: (r.full_name as string | null) ?? null,
      renewedAt: r.renewed_at ? date(r.renewed_at) : null,
    };
  }
}

/** Unit of work for circulation: one Postgres transaction, catalog's stock statements bound to it. */
export class PgCirculationStore implements CirculationStore {
  constructor(
    private readonly db: Db,
    private readonly stockFor: (tx: DbOrTx) => BookStock,
  ) {}

  async inTransaction<T>(work: (tx: CirculationTx) => Promise<T>): Promise<T> {
    try {
      return await this.db.transaction((tx) => work({ loans: new PgLoanWriter(tx), stock: this.stockFor(tx) }));
    } catch (e) {
      throw circulationErrorFrom(e) ?? e;
    }
  }
}
