import { afterAll, describe, expect, it } from "vitest";
import { BookDiscoveryService } from "../src/discovery/application/BookDiscoveryService";
import { BookIndexSync } from "../src/discovery/application/BookIndexSync";
import type { CatalogRetrieval, Embedder } from "../src/discovery/domain/Discovery";
import type { ChunkStore } from "../src/discovery/domain/Indexing";
import { FakeEmbedder } from "../src/discovery/infrastructure/FakeEmbedder";
import { PgAiCache } from "../src/discovery/infrastructure/PgAiCost";
import { PgCatalogRetrieval } from "../src/discovery/infrastructure/PgCatalogRetrieval";
import type { Db } from "../src/platform/db";
import { PgStaffUserRepository } from "../src/staff/infrastructure/PgStaffUserRepository";
import { pool } from "./support";

afterAll(() => pool.end());

/**
 * Defensive code behind `?? fallback` and "row missing" guards: the real schema cannot produce these shapes
 * (NOT NULL columns, a count that always returns a row), so a stand-in database hands them over.
 */
type Result = { rows: Record<string, unknown>[]; rowCount?: number | null };
/** A query builder where any chain of calls ends (when awaited) in `result`. */
const builder = (result: unknown): unknown => {
  const handler: ProxyHandler<() => void> = {
    get: (_t, key) => (key === "then" ? (resolve: (v: unknown) => void) => resolve(result) : proxy),
    apply: () => proxy,
  };
  const proxy: unknown = new Proxy(() => undefined, handler);
  return proxy;
};
const fakeDb = (o: { execute?: Result | Result[]; select?: unknown[] } = {}): Db => {
  const queue = Array.isArray(o.execute) ? [...o.execute] : null;
  return {
    execute: async () => (queue ? queue.shift()! : ((o.execute as Result | undefined) ?? { rows: [], rowCount: null })),
    select: () => builder(o.select ?? []),
    insert: () => builder(undefined),
    update: () => builder([]),
  } as unknown as Db;
};

describe("PgStaffUserRepository guards", () => {
  it("provision and upsertDemo fail loudly when the row is not there afterwards (it would mean the table lost it between statements)", async () => {
    const repo = new PgStaffUserRepository(fakeDb({ select: [] }));
    await expect(
      repo.provision({ email: "a@x.test", fullName: "A", role: "LIBRARIAN", googleSub: "g" }),
    ).rejects.toThrow("provision: row missing after insert");
    await expect(repo.upsertDemo({ email: "a@x.test", fullName: "A", role: "LIBRARIAN" })).rejects.toThrow(
      "upsertDemo: row missing after upsert",
    );
  });

  it("an UPDATE that reports no row count binds nothing; a count query with no row means zero users", async () => {
    expect(
      await new PgStaffUserRepository(fakeDb({ execute: { rows: [], rowCount: null } })).bindGoogleSub("id", "sub"),
    ).toBe(false);
    const empty = await new PgStaffUserRepository(fakeDb({ execute: [{ rows: [] }, { rows: [] }] })).search({
      page: 1,
      size: 10,
    });
    expect(empty).toEqual({ items: [], total: 0 });
  });
});

describe("PgAiCache.purgeExpired", () => {
  it("counts zero when the driver gives no row count", async () => {
    expect(
      await new PgAiCache(fakeDb({ execute: { rows: [], rowCount: null } }), () => new Date()).purgeExpired(),
    ).toBe(0);
  });
});

describe("PgCatalogRetrieval row mapping", () => {
  const book = { id: "b1", title: "T", author: "A", category: "C" };
  it("a row with no description, year or score still maps to a candidate (floor score, empty text)", async () => {
    const r = new PgCatalogRetrieval(fakeDb({ execute: { rows: [book] } }));
    const [c] = await r.hits("whale", { limit: 5, availableOnly: false });
    expect(c).toMatchObject({
      id: "b1",
      description: "",
      publicationYear: null,
      score: 0.002,
      matchedTerms: [],
      related: false,
    });
  });

  it("an empty catalogue query row set still yields a version string", async () => {
    expect(await new PgCatalogRetrieval(fakeDb({ execute: { rows: [] } })).catalogueVersion()).toMatch(/^undefined:/);
  });
});

describe("services built with their defaults", () => {
  const catalog: CatalogRetrieval = {
    candidates: async () => [],
    summaries: async () => new Map(),
    recentLoanTitles: async () => [],
  };

  it("BookDiscoveryService works with only a catalog and a provider (no log callback, default timeout, no cost controls)", async () => {
    const res = await new BookDiscoveryService(catalog, null).discover({ query: "anything" });
    expect(res).toMatchObject({ mode: "FALLBACK", items: [] });
    const withProvider = new BookDiscoveryService(
      { ...catalog, candidates: async () => [] },
      { name: "p", rank: async () => ({}) },
    );
    expect(await withProvider.discover({ query: "anything" })).toMatchObject({ mode: "AI", items: [] });
  });

  it("BookIndexSync works with no log callback and no budget: a failure is swallowed silently, a success needs no budget", async () => {
    const store = (fail: boolean): ChunkStore => ({
      liveBooks: async () => [{ id: "1", title: "T", author: "A", category: "C", description: "d" }],
      indexedHashes: async () => new Map(),
      knownHashes: async () => new Set(),
      apply: async () => {
        if (fail) throw new Error("x");
        return 0;
      },
      nearest: async () => [],
      similarTo: async () => [],
      usesPgvector: async () => false,
    });
    const embedder: Embedder = {
      model: "m",
      dimensions: 2,
      queryPrefix: "",
      minSimilarity: 0.1,
      embed: async (t) => t.map(() => [1, 0]),
    };
    expect(await new BookIndexSync(store(true), embedder).syncAllSafely()).toBeNull();
    await expect(new BookIndexSync(store(true), embedder).syncBookSafely("1")).resolves.toBeUndefined();
    expect(await new BookIndexSync(store(false), embedder).syncAll()).toMatchObject({ embeddedBooks: 1 });
  });
});

describe("FakeEmbedder", () => {
  it("text without searchable words embeds to the zero vector (no NaN), and similar texts embed closer than unrelated ones", async () => {
    const [empty, stop, grief, mourning, space] = await new FakeEmbedder().embed([
      "",
      "a an of",
      "grief and loss",
      "mourning a death",
      "stars and galaxies",
    ]);
    expect(empty!.every((x) => x === 0)).toBe(true);
    expect(stop!.every((x) => x === 0)).toBe(true);
    const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i]!, 0);
    expect(dot(grief!, mourning!)).toBeGreaterThan(0.9); // one concept
    expect(dot(grief!, space!)).toBeLessThan(0.1);
  });
});
