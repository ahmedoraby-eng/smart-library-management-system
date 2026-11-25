import { sql } from "drizzle-orm";
import type { DbOrTx } from "../../platform/db";
import type { BookStock, TakeCopyResult } from "../domain/BookStock";

/**
 * Stock statements of architecture §3.4. Construct it with the caller's transaction handle
 * (`stockFor(tx)`), so the stock change commits or rolls back with the loan row.
 * The DB CHECK (0 ≤ available ≤ total) is the last line of defence behind the WHERE guards.
 */
export class PgBookStock implements BookStock {
  constructor(private readonly db: DbOrTx) {}

  async takeCopy(bookId: string): Promise<TakeCopyResult> {
    const { rows } = await this.db.execute(sql`
      UPDATE books SET available_copies = available_copies - 1, updated_at = now()
       WHERE id = ${bookId} AND archived_at IS NULL AND available_copies > 0
      RETURNING id`);
    if (rows.length) return { kind: "taken" };
    // Explain the 0-row update (same transaction, fresh snapshot under READ COMMITTED).
    const why = await this.db.execute(sql`
      SELECT b.title, b.archived_at,
             (SELECT min(l.due_at) FROM loans l WHERE l.book_id = b.id AND l.returned_at IS NULL) AS next_due_at
        FROM books b WHERE b.id = ${bookId}`);
    const b = why.rows[0];
    if (!b || b.archived_at) return { kind: "not_found" };
    return {
      kind: "unavailable",
      title: b.title as string,
      nextDueAt: b.next_due_at ? new Date(b.next_due_at as string | Date) : null,
    };
  }

  async returnCopy(bookId: string): Promise<void> {
    const { rows } = await this.db.execute(sql`
      UPDATE books SET available_copies = available_copies + 1, updated_at = now()
       WHERE id = ${bookId}
      RETURNING id`);
    // loans.book_id is ON DELETE RESTRICT, so the book of an open loan always exists.
    if (!rows.length) throw new Error(`returnCopy: book ${bookId} not found`);
  }
}

/** Factory the container hands to circulation: catalog's stock statements bound to a transaction. */
export const pgBookStockFor = (tx: DbOrTx): BookStock => new PgBookStock(tx);
