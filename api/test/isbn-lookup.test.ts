import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mapOpenLibrary, OpenLibraryIsbnLookup } from "../src/catalog/infrastructure/OpenLibraryIsbnLookup";
import { as, pool, resetDb, seedStaff, testApp } from "./support";

afterAll(() => pool.end());
let staff: Awaited<ReturnType<typeof seedStaff>>;
beforeEach(async () => { await resetDb(); staff = await seedStaff(); });

// All lookups here use a stubbed fetch: no test touches the live service (SL-13 AC4).
const ISBN = "9780132350884";
const sample = {
  [`ISBN:${ISBN}`]: {
    title: "Clean Code",
    authors: [{ name: "Robert C. Martin" }, { name: "Dean Wampler" }],
    publishers: [{ name: "Prentice Hall" }],
    publish_date: "August 11, 2008",
    cover: { medium: "https://covers.openlibrary.org/b/id/1-M.jpg", large: "https://covers.openlibrary.org/b/id/1-L.jpg" },
  },
};
const json = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status });
const appWith = (fetchFn: ConstructorParameters<typeof OpenLibraryIsbnLookup>[0], timeoutMs?: number) =>
  testApp({ isbnLookup: new OpenLibraryIsbnLookup(fetchFn, timeoutMs) });
const get = async (app: ReturnType<typeof testApp>, who: string, isbn: string) =>
  app.request(`/api/books/isbn-lookup?isbn=${encodeURIComponent(isbn)}`, await as(who));

describe("SLM-13 ISBN lookup", () => {
  it("AC2 maps an Open Library record", async () => {
    const f = vi.fn(json(sample));
    const res = await get(appWith(f), staff.librarian, ISBN);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      found: true,
      book: { title: "Clean Code", author: "Robert C. Martin, Dean Wampler", publisher: "Prentice Hall", publicationYear: 2008, description: null, coverImageUrl: "https://covers.openlibrary.org/b/id/1-L.jpg" },
    });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(`bibkeys=ISBN:${ISBN}`);
    expect((init.headers as Record<string, string>)["user-agent"]).toBe("SmartLibrary/1.0");
  });

  it("normalises a hyphenated ISBN before calling out", async () => {
    const f = vi.fn(json(sample));
    const res = await get(appWith(f), staff.admin, "978-0-13-235088-4");
    expect(((await res.json()) as { found: boolean }).found).toBe(true);
    expect((f.mock.calls[0] as unknown as [string])[0]).toContain(`ISBN:${ISBN}&`);
  });

  it("AC3 not found → found:false not_found", async () => {
    const res = await get(appWith(json({})), staff.librarian, ISBN);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ found: false, reason: "not_found" });
  });

  it("AC3 timeout → found:false timeout", async () => {
    const hang = (_u: string, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
    const res = await get(appWith(hang, 50), staff.librarian, ISBN);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ found: false, reason: "timeout" });
  });

  it("AC3 upstream 500 and network errors → unavailable", async () => {
    expect(await (await get(appWith(json({}, 500)), staff.librarian, ISBN)).json()).toEqual({ found: false, reason: "unavailable" });
    const boom = async () => { throw new TypeError("network down"); };
    expect(await (await get(appWith(boom), staff.librarian, ISBN)).json()).toEqual({ found: false, reason: "unavailable" });
  });

  it("invalid ISBN → 400 VALIDATION_FAILED, no outbound call", async () => {
    const f = vi.fn(json(sample));
    for (const bad of ["123", "9780132350885", ""]) {
      const res = await get(appWith(f), staff.librarian, bad);
      expect(res.status).toBe(400);
      expect(((await res.json()) as { code: string }).code).toBe("VALIDATION_FAILED");
    }
    expect(f).not.toHaveBeenCalled();
  });

  it("Supervisor → 403", async () => {
    const f = vi.fn(json(sample));
    const res = await get(appWith(f), staff.supervisor, ISBN);
    expect(res.status).toBe(403);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("OpenLibrary mapping", () => {
  it("handles missing fields, object descriptions and odd dates", () => {
    expect(mapOpenLibrary({ title: " Dune ", publish_date: "1965", description: { value: "Sand." }, cover: { medium: "m" } })).toEqual({
      title: "Dune", author: null, publisher: null, publicationYear: 1965, description: "Sand.", coverImageUrl: "m",
    });
    expect(mapOpenLibrary({ publish_date: "n.d." }).publicationYear).toBeNull();
  });
});
