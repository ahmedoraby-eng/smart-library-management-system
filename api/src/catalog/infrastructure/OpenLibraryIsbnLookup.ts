import { ISBN_LOOKUP_TIMEOUT_MS } from "@slm/contracts";
import type { IsbnLookup, IsbnLookupBook, IsbnLookupResult } from "../domain/IsbnLookup";

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

interface OpenLibraryData {
  title?: string;
  authors?: { name?: string }[];
  publishers?: { name?: string }[];
  publish_date?: string;
  cover?: { large?: string; medium?: string };
  description?: string | { value?: string };
}

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Maps one Open Library `jscmd=data` record onto our suggestion shape. */
export function mapOpenLibrary(d: OpenLibraryData): IsbnLookupBook {
  const authors = (d.authors ?? []).map((a) => text(a.name)).filter((n): n is string => n !== null);
  const year = /\b(\d{4})\b/.exec(d.publish_date ?? "");
  const desc = typeof d.description === "object" ? d.description?.value : d.description;
  return {
    title: text(d.title),
    author: authors.length ? authors.join(", ") : null,
    publisher: text(d.publishers?.[0]?.name),
    publicationYear: year ? Number(year[1]) : null,
    description: text(desc),
    coverImageUrl: text(d.cover?.large) ?? text(d.cover?.medium),
  };
}

/**
 * Small in-memory cache of successful lookups (SLM-13). It lives in one Worker isolate, so it
 * is only a shortcut for repeated clicks: a miss just asks Open Library again. Only found books
 * are stored, never "timeout" or "unavailable".
 */
export class IsbnLookupCache {
  private readonly entries = new Map<string, { book: IsbnLookupBook; expires: number }>();
  constructor(
    private readonly maxEntries = 200,
    private readonly ttlMs = 60 * 60 * 1000,
    private readonly now: () => number = Date.now,
  ) {}

  get(isbn: string): IsbnLookupBook | null {
    const e = this.entries.get(isbn);
    if (!e) return null;
    if (e.expires <= this.now()) {
      this.entries.delete(isbn);
      return null;
    }
    return e.book;
  }

  set(isbn: string, book: IsbnLookupBook): void {
    this.entries.delete(isbn);
    // Map keeps insertion order: the first key is the oldest entry.
    if (this.entries.size >= this.maxEntries) this.entries.delete(this.entries.keys().next().value!);
    this.entries.set(isbn, { book, expires: this.now() + this.ttlMs });
  }
}

/** Open Library adapter. `fetchFn` is injected so tests never reach the live service. */
export class OpenLibraryIsbnLookup implements IsbnLookup {
  constructor(
    private readonly fetchFn: FetchLike = (url, init) => fetch(url, init),
    private readonly timeoutMs = ISBN_LOOKUP_TIMEOUT_MS,
    private readonly cache?: IsbnLookupCache,
  ) {}

  async lookup(isbn: string): Promise<IsbnLookupResult> {
    const cached = this.cache?.get(isbn);
    if (cached) return { found: true, book: cached };
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(isbn)}&format=json&jscmd=data`;
      const res = await this.fetchFn(url, {
        signal: ctl.signal,
        headers: { "user-agent": "SmartLibrary/1.0", accept: "application/json" },
      });
      if (!res.ok) return { found: false, reason: "unavailable" };
      const json = (await res.json()) as Record<string, OpenLibraryData> | null;
      const data = json?.[`ISBN:${isbn}`];
      if (!data || typeof data !== "object") return { found: false, reason: "not_found" };
      const book = mapOpenLibrary(data);
      if (Object.values(book).every((v) => v === null)) return { found: false, reason: "not_found" };
      this.cache?.set(isbn, book);
      return { found: true, book };
    } catch (e) {
      return {
        found: false,
        reason: ctl.signal.aborted || (e as { name?: string })?.name === "AbortError" ? "timeout" : "unavailable",
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
