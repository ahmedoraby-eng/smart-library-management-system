import type { BookInput, BookSortKey } from "@slm/contracts";
import { sql, type SQL } from "drizzle-orm";
import { PgCode, pgError, type Db } from "../../platform/db";
import type { BookListParams, BookRepository, BookView, CreateResult, DeletionOutcome, UpdateResult } from "../domain/Book";
import { books } from "./schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Loan facts per book. This read model reads the `loans` table by name (not circulation's Drizzle
 * schema), as architecture §4 specifies: the derived BookDto fields come from one aggregate, never stored.
 */
const LOAN_FACTS = sql`LEFT JOIN LATERAL (
    SELECT count(*) FILTER (WHERE l.returned_at IS NULL)::int AS active_loans,
           min(l.due_at) FILTER (WHERE l.returned_at IS NULL) AS next_due_at,
           count(*) > 0 AS has_loan_history
      FROM loans l WHERE l.book_id = b.id
  ) lf ON true`;

const SELECT_VIEW = sql`SELECT b.id, b.title, b.author, b.isbn, b.description, b.category, b.publisher,
    b.publication_year, b.cover_image_url, b.total_copies, b.available_copies, b.version,
    b.created_at, b.updated_at, b.archived_at,
    coalesce(lf.active_loans, 0) AS active_loans, lf.next_due_at, coalesce(lf.has_loan_history, false) AS has_loan_history
  FROM books b ${LOAN_FACTS}`;

const SORT_SQL: Record<BookSortKey, SQL> = {
  title: sql`lower(b.title)`,
  author: sql`lower(b.author)`,
  createdAt: sql`b.created_at`,
  publicationYear: sql`b.publication_year`,
  availableCopies: sql`b.available_copies`,
};

type Row = Record<string, unknown>;

function toView(r: Row): BookView {
  return {
    id: r.id as string,
    title: r.title as string,
    author: r.author as string,
    isbn: (r.isbn as string | null) ?? null,
    description: r.description as string,
    category: r.category as string,
    publisher: r.publisher as string,
    publicationYear: (r.publication_year as number | null) ?? null,
    coverImageUrl: (r.cover_image_url as string | null) ?? null,
    totalCopies: r.total_copies as number,
    availableCopies: r.available_copies as number,
    version: r.version as number,
    createdAt: new Date(r.created_at as string | Date),
    updatedAt: new Date(r.updated_at as string | Date),
    archivedAt: r.archived_at ? new Date(r.archived_at as string | Date) : null,
    activeLoans: Number(r.active_loans ?? 0),
    nextDueAt: r.next_due_at ? new Date(r.next_due_at as string | Date) : null,
    hasLoanHistory: Boolean(r.has_loan_history),
  };
}

/** "clean arch" → "clean:* & arch:*" (prefix match while typing); null if nothing searchable is left. */
function prefixTsQuery(q: string): string | null {
  const terms = q.toLowerCase().match(/[\p{L}\p{N}]+/gu)?.slice(0, 8) ?? [];
  return terms.length ? terms.map((t) => `${t}:*`).join(" & ") : null;
}

export class PgBookRepository implements BookRepository {
  constructor(private readonly db: Db) {}

  async findView(id: string): Promise<BookView | null> {
    if (!UUID.test(id)) return null;
    const { rows } = await this.db.execute(sql`${SELECT_VIEW} WHERE b.id = ${id}`);
    return rows[0] ? toView(rows[0]) : null;
  }

  async list(p: BookListParams): Promise<{ items: BookView[]; total: number }> {
    const where: SQL[] = [sql`b.archived_at IS NULL`];
    let relevance: SQL | null = null;
    if (p.q) {
      const ts = prefixTsQuery(p.q);
      const isbn = p.q.replace(/[-\s]/g, "").toUpperCase();
      const parts: SQL[] = [
        sql`b.isbn = ${isbn}`,
        // typo tolerance: a word of the title/author close to the query (pg_trgm word similarity)
        sql`word_similarity(${p.q}, b.title) > 0.45`,
        sql`word_similarity(${p.q}, b.author) > 0.45`,
        sql`b.publisher ILIKE ${"%" + p.q.replace(/[\\%_]/g, (m) => "\\" + m) + "%"}`,
      ];
      if (ts) parts.unshift(sql`b.search @@ to_tsquery('english', ${ts})`);
      where.push(sql`(${sql.join(parts, sql` OR `)})`);
      relevance = ts
        ? sql`(ts_rank_cd(b.search, to_tsquery('english', ${ts})) + greatest(word_similarity(${p.q}, b.title), word_similarity(${p.q}, b.author)))`
        : sql`greatest(word_similarity(${p.q}, b.title), word_similarity(${p.q}, b.author))`;
    }
    if (p.category) where.push(sql`b.category = ${p.category}`);
    if (p.availability === "available") where.push(sql`b.available_copies > 0`);
    if (p.availability === "unavailable") where.push(sql`b.available_copies = 0`);

    // Explicit sort wins; a search without one sorts by relevance; ties break on title then id (stable paging).
    const explicit = p.sort.map((s) => sql`${SORT_SQL[s.key]} ${s.desc ? sql`DESC NULLS LAST` : sql`ASC NULLS LAST`}`);
    const order = relevance && p.sort.length === 1 && p.sort[0]!.key === "title" && !p.sort[0]!.desc
      ? [sql`${relevance} DESC`, ...explicit]
      : explicit;
    order.push(sql`lower(b.title) ASC`, sql`b.id ASC`);

    const whereSql = sql.join(where, sql` AND `);
    const [{ rows }, count] = await Promise.all([
      this.db.execute(sql`${SELECT_VIEW} WHERE ${whereSql} ORDER BY ${sql.join(order, sql`, `)}
        LIMIT ${p.size} OFFSET ${(p.page - 1) * p.size}`),
      this.db.execute(sql`SELECT count(*)::int AS n FROM books b WHERE ${whereSql}`),
    ]);
    return { items: rows.map(toView), total: Number(count.rows[0]?.n ?? 0) };
  }

  async categories(): Promise<string[]> {
    const { rows } = await this.db.execute(
      sql`SELECT DISTINCT category FROM books WHERE archived_at IS NULL ORDER BY category`,
    );
    return rows.map((r) => r.category as string);
  }

  async create(input: BookInput): Promise<CreateResult> {
    try {
      const [row] = await this.db
        .insert(books)
        .values({ ...input, availableCopies: input.totalCopies })
        .returning({ id: books.id });
      return { kind: "ok", book: (await this.findView(row!.id))! };
    } catch (e) {
      const dup = await this.duplicateIsbn(e, input.isbn);
      if (dup) return dup;
      throw e;
    }
  }

  async update(id: string, version: number, input: BookInput): Promise<UpdateResult> {
    if (!UUID.test(id)) return { kind: "not_found" };
    try {
      // One guarded statement: no read-then-write race with a concurrent borrow or edit.
      const { rows } = await this.db.execute(sql`
        UPDATE books SET
          title = ${input.title}, author = ${input.author}, isbn = ${input.isbn}, description = ${input.description},
          category = ${input.category}, publisher = ${input.publisher}, publication_year = ${input.publicationYear},
          cover_image_url = ${input.coverImageUrl},
          available_copies = ${input.totalCopies} - (total_copies - available_copies),
          total_copies = ${input.totalCopies},
          version = version + 1, updated_at = now()
        WHERE id = ${id} AND version = ${version} AND archived_at IS NULL
          AND ${input.totalCopies} >= total_copies - available_copies
        RETURNING id`);
      if (rows.length) return { kind: "ok", book: (await this.findView(id))! };
    } catch (e) {
      const dup = await this.duplicateIsbn(e, input.isbn);
      if (dup) return dup;
      throw e;
    }
    // Explain the 0-row update.
    const { rows } = await this.db.execute(
      sql`SELECT version, archived_at, total_copies - available_copies AS on_loan FROM books WHERE id = ${id}`,
    );
    const cur = rows[0];
    if (!cur || cur.archived_at) return { kind: "not_found" };
    if (cur.version !== version) return { kind: "stale" };
    return { kind: "below_loaned", onLoan: Number(cur.on_loan) };
  }

  async removeWith(
    id: string,
    decide: (state: { title: string; activeLoans: number; hasLoanHistory: boolean }) => DeletionOutcome,
  ): Promise<DeletionOutcome | null> {
    if (!UUID.test(id)) return null;
    return this.db.transaction(async (tx) => {
      // Lock the book: a concurrent borrow (UPDATE … WHERE archived_at IS NULL) waits for us.
      const locked = await tx.execute(sql`SELECT id, title FROM books WHERE id = ${id} AND archived_at IS NULL FOR UPDATE`);
      const book = locked.rows[0];
      if (!book) return null;
      const facts = await tx.execute(sql`SELECT count(*) FILTER (WHERE returned_at IS NULL)::int AS active,
          count(*)::int AS any FROM loans WHERE book_id = ${id}`);
      const f = facts.rows[0]!;
      const outcome = decide({ title: book.title as string, activeLoans: Number(f.active), hasLoanHistory: Number(f.any) > 0 });
      if (outcome === "archive") {
        await tx.execute(sql`UPDATE books SET archived_at = now(), updated_at = now(), version = version + 1 WHERE id = ${id}`);
      } else {
        await tx.execute(sql`DELETE FROM books WHERE id = ${id}`);
      }
      return outcome;
    });
  }

  private async duplicateIsbn(e: unknown, isbn: string | null): Promise<{ kind: "duplicate_isbn"; other: { id: string; title: string } } | null> {
    const pe = pgError(e);
    if (!isbn || pe?.code !== PgCode.uniqueViolation || pe.constraint !== "books_isbn_uq") return null;
    const { rows } = await this.db.execute(sql`SELECT id, title FROM books WHERE isbn = ${isbn} AND archived_at IS NULL LIMIT 1`);
    const other = rows[0];
    return { kind: "duplicate_isbn", other: { id: (other?.id as string) ?? "", title: (other?.title as string) ?? "" } };
  }
}
