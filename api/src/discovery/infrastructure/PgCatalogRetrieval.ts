import { sql, type SQL } from "drizzle-orm";
import type { Db } from "../../platform/db";
import type { Candidate, DiscoveryBook, LexicalRetrieval } from "../domain/Discovery";

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_HITS = 5; // fewer text hits than this → top up from related categories
const TOP_UP_SCORE = 0.001; // below any real match, so the fallback ranks topped-up books last
const STOP = new Set(["the", "and", "for", "with", "who", "that", "this", "about", "books", "book", "some", "want", "wants", "need", "needs", "someone", "member", "recommend", "like", "already", "from", "into", "have", "has", "are", "was", "but", "not", "any", "can", "how", "what", "give", "show", "find"]);

/** Searchable words of the request: letters and digits only (so no tsquery operator can get through). */
export function queryTerms(q: string): string[] {
  const words = q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...new Set(words.filter((w) => w.length >= 3 && !STOP.has(w)))].slice(0, 12);
}

/** Which request words show up (as a word prefix, so "architecture" ≈ "architectures") in the book's own text. */
export function matchedTermsOf(terms: string[], text: string): string[] {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return terms.filter((t) => {
    const stem = t.length > 5 ? t.slice(0, t.length - 2) : t;
    return words.some((w) => w.startsWith(stem));
  }).slice(0, 4);
}

const toCandidate = (r: Row, terms: string[], related: boolean): Candidate => {
  const description = String(r.description ?? "").slice(0, 200);
  const title = r.title as string;
  const category = r.category as string;
  const author = r.author as string;
  return {
    id: r.id as string, title, author, category,
    publicationYear: (r.publication_year as number | null) ?? null,
    description,
    score: related ? TOP_UP_SCORE : Math.max(Number(r.score ?? 0), TOP_UP_SCORE * 2),
    matchedTerms: related ? [] : matchedTermsOf(terms, `${title} ${category} ${author} ${description}`),
    related,
  };
};

/**
 * Postgres full-text (ts_rank_cd on the weighted `books.search` vector, terms OR-ed, english stemming)
 * plus trigram word similarity for typos; deterministic. The lexical half of hybrid retrieval (SLM-16). Reads the `loans` table
 * by name for the member's recent titles (architecture §6, read model).
 */
export class PgCatalogRetrieval implements LexicalRetrieval {
  constructor(private readonly db: Db) {}

  async candidates(query: string, opts: { limit: number; availableOnly: boolean }): Promise<Candidate[]> {
    const out = await this.hits(query, opts);
    if (out.length < Math.min(MIN_HITS, opts.limit)) out.push(...(await this.topUp(query, out, opts)));
    return out;
  }

  /** Full-text + trigram matches only, best first (no category top-up). */
  async hits(query: string, opts: { limit: number; availableOnly: boolean }): Promise<Candidate[]> {
    const terms = queryTerms(query);
    const avail: SQL = opts.availableOnly ? sql`AND b.available_copies > 0` : sql``;
    const tsq = terms.length ? sql`to_tsquery('english', ${terms.join(" | ")})` : null;
    const sim = sql`greatest(word_similarity(b.title, ${query}), word_similarity(b.author, ${query}))`;
    const rank = tsq ? sql`(ts_rank_cd(b.search, ${tsq}) + ${sim})` : sim;
    const hitWhere = tsq ? sql`(b.search @@ ${tsq} OR ${sim} > 0.5)` : sql`${sim} > 0.5`;

    const hits = await this.db.execute(sql`SELECT b.id, b.title, b.author, b.category, b.publication_year, b.description, ${rank} AS score
      FROM books b WHERE b.archived_at IS NULL ${avail} AND ${hitWhere}
      ORDER BY score DESC, lower(b.title) ASC, b.id ASC LIMIT ${opts.limit}`);
    return hits.rows.map((r) => toCandidate(r, terms, false));
  }

  /** Candidates for books found by another retriever (vector search), in the given order. */
  async byIds(ids: string[], query: string, opts: { availableOnly: boolean }): Promise<Candidate[]> {
    const valid = ids.filter((i) => UUID.test(i));
    if (!valid.length) return [];
    const terms = queryTerms(query);
    const avail: SQL = opts.availableOnly ? sql`AND b.available_copies > 0` : sql``;
    const { rows } = await this.db.execute(sql`SELECT b.id, b.title, b.author, b.category, b.publication_year, b.description
      FROM books b WHERE b.archived_at IS NULL ${avail} AND b.id IN (${sql.join(valid.map((i) => sql`${i}::uuid`), sql`, `)})`);
    const byId = new Map(rows.map((r) => [r.id as string, toCandidate(r, terms, false)]));
    return valid.flatMap((i) => byId.get(i) ?? []);
  }

  /** Books from the closest categories (those of `have`, or one whose name resembles the request), marked related. */
  async topUp(query: string, have: Candidate[], opts: { limit: number; availableOnly: boolean }): Promise<Candidate[]> {
    const terms = queryTerms(query);
    const avail: SQL = opts.availableOnly ? sql`AND b.available_copies > 0` : sql``;
    const ids = have.map((c) => sql`${c.id}::uuid`);
    const notIn = ids.length ? sql`AND b.id NOT IN (${sql.join(ids, sql`, `)})` : sql``;
    const hitCategories = [...new Set(have.map((c) => c.category))];
    const inHit = hitCategories.length ? sql`b.category IN (${sql.join(hitCategories.map((c) => sql`${c}`), sql`, `)}) OR` : sql``;
    const more = await this.db.execute(sql`SELECT b.id, b.title, b.author, b.category, b.publication_year, b.description
      FROM books b WHERE b.archived_at IS NULL ${avail} ${notIn}
        AND (${inHit} word_similarity(b.category, ${query}) > 0.5)
      ORDER BY b.available_copies DESC, lower(b.title) ASC, b.id ASC LIMIT ${Math.max(opts.limit - have.length, 0)}`);
    return more.rows.map((r) => toCandidate(r, terms, true));
  }

  async summaries(ids: string[]): Promise<Map<string, DiscoveryBook>> {
    const valid = ids.filter((i) => UUID.test(i));
    const map = new Map<string, DiscoveryBook>();
    if (!valid.length) return map;
    const { rows } = await this.db.execute(sql`SELECT b.id, b.title, b.author, b.category, b.publication_year, b.cover_image_url,
        b.available_copies, b.total_copies, nd.next_due_at
      FROM books b
      LEFT JOIN LATERAL (SELECT min(due_at) AS next_due_at FROM loans WHERE book_id = b.id AND returned_at IS NULL) nd ON true
      WHERE b.archived_at IS NULL AND b.id IN (${sql.join(valid.map((i) => sql`${i}::uuid`), sql`, `)})`);
    for (const r of rows) {
      map.set(r.id as string, {
        id: r.id as string, title: r.title as string, author: r.author as string, category: r.category as string,
        publicationYear: (r.publication_year as number | null) ?? null, coverImageUrl: (r.cover_image_url as string | null) ?? null,
        availableCopies: Number(r.available_copies), totalCopies: Number(r.total_copies),
        nextDueAt: r.next_due_at ? new Date(r.next_due_at as string | Date).toISOString() : null,
      });
    }
    return map;
  }

  async recentLoanTitles(memberId: string, limit: number): Promise<string[]> {
    if (!UUID.test(memberId)) return [];
    const { rows } = await this.db.execute(sql`SELECT b.title FROM loans l JOIN books b ON b.id = l.book_id
      WHERE l.member_id = ${memberId}::uuid ORDER BY l.borrowed_at DESC, l.id DESC LIMIT ${limit}`);
    return rows.map((r) => r.title as string);
  }
}
