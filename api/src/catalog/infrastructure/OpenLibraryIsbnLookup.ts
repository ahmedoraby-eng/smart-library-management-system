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

/** Open Library adapter. `fetchFn` is injected so tests never reach the live service. */
export class OpenLibraryIsbnLookup implements IsbnLookup {
  constructor(
    private readonly fetchFn: FetchLike = (url, init) => fetch(url, init),
    private readonly timeoutMs = 3000,
  ) {}

  async lookup(isbn: string): Promise<IsbnLookupResult> {
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
      return Object.values(book).every((v) => v === null)
        ? { found: false, reason: "not_found" }
        : { found: true, book };
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
