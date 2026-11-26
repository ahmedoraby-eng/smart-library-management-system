import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AI_TIMEOUT_MS,
  BookDiscoveryService,
  BUDGET_NOTE,
  NO_MATCH_NOTE,
  quotaKeywordNote,
  quotaNote,
  RESULT_CACHE_TTL_SECONDS,
  SINGLE_NOTE,
  type CostControls,
  type DiscoveryLog,
} from "../src/discovery/application/BookDiscoveryService";
import { BOOK_SYNC_TIMEOUT_MS, BookIndexSync, DEFAULT_BATCH_BOOKS } from "../src/discovery/application/BookIndexSync";
import { WORST_CASE_RANK_NEURONS, type AiBudget, type AiCache, type BudgetVerdict } from "../src/discovery/domain/Cost";
import type {
  AiProvider,
  Candidate,
  CatalogRetrieval,
  DiscoveryBook,
  Embedder,
  RetrievalMode,
} from "../src/discovery/domain/Discovery";
import type { ChunkStore, IndexableBook } from "../src/discovery/domain/Indexing";

afterEach(() => vi.useRealTimers());

const cand = (id: string, over: Partial<Candidate> = {}): Candidate => ({
  id,
  title: `Title ${id}`,
  author: "Au",
  category: "Cat",
  publicationYear: null,
  description: "d",
  score: 1,
  matchedTerms: ["t"],
  related: false,
  ...over,
});
const summary = (id: string): DiscoveryBook => ({
  id,
  title: `Title ${id}`,
  author: "Au",
  category: "Cat",
  publicationYear: null,
  coverImageUrl: null,
  availableCopies: 1,
  totalCopies: 2,
  nextDueAt: null,
});
const recs = (...ids: string[]) => ({
  recommendations: ids.map((id, i) => ({ bookId: id, reason: `because ${id}`, fit: 5 - i })),
  note: "model note",
});

interface FakeCatalogOptions {
  candidates?: Candidate[];
  missing?: string[];
  mode?: RetrievalMode;
  neurons?: number;
  version?: string | null;
  recent?: string[];
}
function catalog(o: FakeCatalogOptions = {}) {
  const calls = { candidates: [] as Array<{ query: string; opts: unknown }>, recent: [] as Array<[string, number]> };
  const c: CatalogRetrieval = {
    candidates: async (query, opts) => {
      calls.candidates.push({ query, opts });
      return o.candidates ?? [];
    },
    summaries: async (ids) => new Map(ids.filter((i) => !(o.missing ?? []).includes(i)).map((i) => [i, summary(i)])),
    recentLoanTitles: async (memberId, limit) => {
      calls.recent.push([memberId, limit]);
      return o.recent ?? [];
    },
    ...(o.mode ? { lastMode: () => o.mode! } : {}),
    ...(o.neurons !== undefined ? { lastNeurons: () => o.neurons! } : {}),
    ...(o.version === null ? {} : { catalogueVersion: async () => o.version ?? "v1" }),
  };
  return { c, calls };
}

function memoryCache() {
  const store = new Map<string, { value: unknown; ttl: number }>();
  const cache: AiCache & { store: typeof store } = {
    store,
    get: async (k) => store.get(k)?.value ?? null,
    set: async (k, value, ttl) => {
      store.set(k, { value, ttl });
    },
  };
  return cache;
}

function fakeBudget(
  o: {
    verdict?: BudgetVerdict;
    under?: boolean;
    today?: number | Error;
    left?: { left: number; limit: number } | Error;
    addFails?: boolean;
  } = {},
) {
  const added: Array<[number, string | undefined]> = [];
  const b: AiBudget = {
    reserveSearch: vi.fn(async () => o.verdict ?? "OK"),
    underCap: vi.fn(async () => o.under ?? true),
    addNeurons: async (n, u) => {
      if (o.addFails) throw new Error("db down");
      added.push([n, u]);
    },
    today: async () => {
      if (o.today instanceof Error) throw o.today;
      return { day: "d", searches: 0, neurons: o.today ?? 0, neuronCap: 1, userQuota: 1 };
    },
    searchesLeft: async () => {
      if (o.left instanceof Error) throw o.left;
      return o.left ?? { left: 3, limit: 5 };
    },
  };
  return Object.assign(b, { added });
}

const provider = (rank: AiProvider["rank"], name = "test"): AiProvider => ({ name, rank });
const good = (...ids: string[]) => provider(async () => recs(...ids));
const run = (
  c: CatalogRetrieval,
  p: AiProvider | null,
  cost: CostControls = {},
  log: DiscoveryLog = () => undefined,
  timeout = AI_TIMEOUT_MS,
) => new BookDiscoveryService(c, p, log, timeout, cost);
const ask = (svc: BookDiscoveryService, extra: Record<string, unknown> = {}, ctx: { userId?: string } = {}) =>
  svc.discover({ query: "a book about whales", ...extra } as never, ctx);

describe("discovery: no model involved", () => {
  it("nothing matches → an empty answer with the standard note (AI mode when a model exists, fallback when not)", async () => {
    const { c } = catalog();
    expect(await ask(run(c, good()))).toMatchObject({ mode: "AI", items: [], note: NO_MATCH_NOTE, tier: 1 });
    const none = await ask(run(c, null));
    expect(none).toMatchObject({ mode: "FALLBACK", items: [], note: NO_MATCH_NOTE });
    expect(none).not.toHaveProperty("fallbackReason");
  });

  it("no provider: keyword ranking with the NO_PROVIDER reason; one candidate: SINGLE_CANDIDATE without calling the model", async () => {
    const { c } = catalog({ candidates: [cand("a", { score: 1 }), cand("b", { score: 2 })] });
    const noProvider = await ask(run(c, null));
    expect(noProvider).toMatchObject({ mode: "FALLBACK", fallbackReason: "NO_PROVIDER", tier: 3 });
    expect(noProvider.items.map((i) => i.book.id)).toEqual(["b", "a"]);
    const rank = vi.fn();
    const one = await ask(run(catalog({ candidates: [cand("a")] }).c, provider(rank as never)));
    expect(one).toMatchObject({ mode: "FALLBACK", fallbackReason: "SINGLE_CANDIDATE", note: SINGLE_NOTE });
    expect(rank).not.toHaveBeenCalled();
  });

  it("a candidate whose book vanished between retrieval and the summary read is left out; foundBy is passed through", async () => {
    const { c } = catalog({ candidates: [cand("a", { foundBy: "both" }), cand("gone"), cand("b")], missing: ["gone"] });
    const res = await ask(run(c, null));
    expect(res.items.map((i) => i.book.id)).toEqual(["a", "b"]);
    expect(res.items[0]).toMatchObject({ foundBy: "both" });
    expect(res.items[1]).not.toHaveProperty("foundBy");
  });

  it("passes availableOnly and the candidate cap to retrieval; limit is capped at five", async () => {
    const { c, calls } = catalog({ candidates: Array.from({ length: 8 }, (_, i) => cand(`c${i}`, { score: 10 - i })) });
    const res = await ask(run(c, null), { availableOnly: true, limit: 3 });
    expect(calls.candidates[0]!.opts).toEqual({ limit: 20, availableOnly: true });
    expect(res.items).toHaveLength(3);
    expect((await ask(run(c, null), { limit: 99 })).items).toHaveLength(5);
    expect((await ask(run(c, null))).items).toHaveLength(5);
    await ask(run(c, null));
    expect(calls.candidates.at(-1)!.opts).toEqual({ limit: 20, availableOnly: false });
  });

  it("retrieval mode decides the tier of a fallback: hybrid → 2, lexical or unknown → 3", async () => {
    const two = await ask(run(catalog({ candidates: [cand("a"), cand("b")], mode: "hybrid" }).c, null));
    expect(two).toMatchObject({ tier: 2, retrieval: "hybrid" });
    const three = await ask(run(catalog({ candidates: [cand("a"), cand("b")], mode: "lexical" }).c, null));
    expect(three).toMatchObject({ tier: 3, retrieval: "lexical" });
  });
});

describe("discovery: model ranking", () => {
  it("returns the model's picks in order, with the model's reasons and note, and logs mode, retrieval and Neurons", async () => {
    const logs: Parameters<DiscoveryLog>[0][] = [];
    const { c } = catalog({ candidates: [cand("a"), cand("b"), cand("c")], mode: "hybrid", neurons: 0.5 });
    const p = provider(async ({ onUsage }) => {
      onUsage?.({ model: "@cf/baai/bge-base-en-v1.5", inputTokens: 1_000_000, outputTokens: 0, estimated: false }); // 6058 Neurons
      return recs("c", "a");
    }, "wai");
    const res = await ask(
      run(c, p, { budget: fakeBudget({ today: 12.34 }) }, (e) => logs.push(e)),
      {},
      { userId: "u1" },
    );
    expect(res).toMatchObject({
      mode: "AI",
      note: "model note",
      tier: 1,
      retrieval: "hybrid",
      aiSearches: { left: 3, limit: 5 },
    });
    expect(res.items.map((i) => [i.book.id, i.reason])).toEqual([
      ["c", "because c"],
      ["a", "because a"],
    ]);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      mode: "AI",
      candidates: 3,
      fallbackReason: null,
      provider: "wai",
      dropped: 0,
      cacheHit: false,
      retrieval: "hybrid",
      neuronsToday: 12.34,
      neurons: 6058.5,
    });
    expect(JSON.stringify(logs[0])).not.toContain("whales"); // the request text is never logged
  });

  it("a member's reading is sent to the model (titles only, five of them) and the answer is never cached for a member", async () => {
    const seen: string[][] = [];
    const cache = memoryCache();
    const { c, calls } = catalog({ candidates: [cand("a"), cand("b")], recent: ["Old Title"] });
    const p = provider(async ({ memberRecentTitles }) => {
      seen.push(memberRecentTitles);
      return recs("a");
    });
    await ask(run(c, p, { cache }), { memberId: "11111111-1111-4111-8111-111111111111" });
    expect(seen).toEqual([["Old Title"]]);
    expect(calls.recent).toEqual([["11111111-1111-4111-8111-111111111111", 5]]);
    expect(cache.store.size).toBe(0);
  });

  it("failure to read the member's loans is a provider-side failure → keyword fallback", async () => {
    const { c } = catalog({ candidates: [cand("a"), cand("b")] });
    c.recentLoanTitles = async () => {
      throw new Error("db down");
    };
    expect(await ask(run(c, good("a")), { memberId: "11111111-1111-4111-8111-111111111111" })).toMatchObject({
      mode: "FALLBACK",
      fallbackReason: "PROVIDER_ERROR",
    });
  });

  it("a provider that throws → PROVIDER_ERROR and the call is charged the model's own usage when it reported one, else the worst case", async () => {
    const { c } = catalog({ candidates: [cand("a"), cand("b")] });
    const b1 = fakeBudget();
    const reported = provider(async ({ onUsage }) => {
      onUsage?.({ model: "@cf/meta/llama-3.2-3b-instruct", inputTokens: 1_000_000, outputTokens: 0, estimated: false });
      throw new Error("boom");
    });
    const r1 = await ask(run(c, reported, { budget: b1 }), {}, { userId: "u1" });
    expect(r1).toMatchObject({ mode: "FALLBACK", fallbackReason: "PROVIDER_ERROR" });
    expect(b1.added).toEqual([[4625, "u1"]]);
    const b2 = fakeBudget();
    await ask(
      run(
        c,
        provider(async () => {
          throw new Error("boom");
        }),
        { budget: b2 },
      ),
    );
    expect(b2.added).toEqual([[WORST_CASE_RANK_NEURONS, undefined]]);
  });

  it("a provider that never answers times out → TIMEOUT, the request is aborted, the worst case is charged", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const slow = provider(({ signal: s }) => {
      signal = s;
      return new Promise(() => undefined);
    });
    const budget = fakeBudget();
    const { c } = catalog({ candidates: [cand("a"), cand("b")] });
    const pending = ask(run(c, slow, { budget }, undefined, 50));
    await vi.advanceTimersByTimeAsync(49);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    const res = await pending;
    expect(res).toMatchObject({ mode: "FALLBACK", fallbackReason: "TIMEOUT" });
    expect(signal?.aborted).toBe(true);
    expect(budget.added).toEqual([[WORST_CASE_RANK_NEURONS, undefined]]);
    expect(vi.getTimerCount()).toBe(0); // the timer is always cleared
  });

  it("an answer that is not a ranking → INVALID_OUTPUT; one whose every pick is a made-up id → NO_VALID_ITEMS with the drop count", async () => {
    const logs: Parameters<DiscoveryLog>[0][] = [];
    const { c } = catalog({ candidates: [cand("a"), cand("b")] });
    const bad = await ask(
      run(
        c,
        provider(async () => "I cannot help"),
        {},
        (e) => logs.push(e),
      ),
    );
    expect(bad).toMatchObject({ mode: "FALLBACK", fallbackReason: "INVALID_OUTPUT" });
    expect(bad.items).toHaveLength(2);
    const made = await ask(run(c, good("zzz", "yyy"), {}, (e) => logs.push(e)));
    expect(made).toMatchObject({ mode: "FALLBACK", fallbackReason: "NO_VALID_ITEMS" });
    expect(logs[1]).toMatchObject({ fallbackReason: "NO_VALID_ITEMS", dropped: 2 });
    // an empty list with nothing dropped is a legitimate «nothing fits»
    const none = await ask(
      run(
        c,
        provider(async () => ({ recommendations: [], note: "Nothing fits." })),
      ),
    );
    expect(none).toMatchObject({ mode: "AI", items: [], note: "Nothing fits." });
    const noNote = await ask(
      run(
        c,
        provider(async () => ({ recommendations: [] })),
      ),
    );
    expect(noNote).toMatchObject({ mode: "AI", items: [], note: NO_MATCH_NOTE });
  });

  it("a budget that cannot be written to never fails the search", async () => {
    const { c } = catalog({ candidates: [cand("a"), cand("b")] });
    const budget = fakeBudget({ addFails: true, today: new Error("down"), left: new Error("down") });
    const res = await ask(run(c, good("a"), { budget }), {}, { userId: "u1" });
    expect(res).toMatchObject({ mode: "AI" });
    expect(res).not.toHaveProperty("aiSearches");
  });
});

describe("discovery: daily budget tiers", () => {
  const two = () => catalog({ candidates: [cand("a"), cand("b")] });

  it("QUOTA_EXCEEDED: ranked without the model; the note says «meaning» (hybrid) or «keywords» (embeddings down); it never calls the model", async () => {
    const rank = vi.fn();
    const hybrid = catalog({ candidates: [cand("a"), cand("b")], mode: "hybrid" });
    const r1 = await ask(
      run(hybrid.c, provider(rank as never), { budget: fakeBudget({ verdict: "QUOTA_EXCEEDED" }), userQuota: 7 }),
      {},
      { userId: "u1" },
    );
    expect(r1).toMatchObject({ mode: "FALLBACK", fallbackReason: "QUOTA_EXCEEDED", note: quotaNote(7), tier: 2 });
    const lexical = catalog({ candidates: [cand("a"), cand("b")], mode: "lexical" });
    const r2 = await ask(
      run(lexical.c, provider(rank as never), { budget: fakeBudget({ verdict: "QUOTA_EXCEEDED" }), userQuota: 7 }),
      {},
      { userId: "u1" },
    );
    expect(r2).toMatchObject({ note: quotaKeywordNote(7), tier: 3 });
    const unset = await ask(
      run(two().c, provider(rank as never), { budget: fakeBudget({ verdict: "QUOTA_EXCEEDED" }) }),
      {},
      { userId: "u1" },
    );
    expect(unset.note).toBe(quotaNote(0));
    expect(rank).not.toHaveBeenCalled();
  });

  it("BUDGET_EXHAUSTED from the reservation, or an exhausted cap for a caller with no user id, gives the keyword fallback", async () => {
    const rank = vi.fn();
    const reserved = await ask(
      run(two().c, provider(rank as never), { budget: fakeBudget({ verdict: "BUDGET_EXHAUSTED" }) }),
      {},
      { userId: "u1" },
    );
    expect(reserved).toMatchObject({ fallbackReason: "BUDGET_EXHAUSTED", note: BUDGET_NOTE });
    const anon = fakeBudget({ under: false });
    const capped = await ask(run(two().c, provider(rank as never), { budget: anon }));
    expect(capped).toMatchObject({ fallbackReason: "BUDGET_EXHAUSTED", note: BUDGET_NOTE });
    expect(anon.reserveSearch).not.toHaveBeenCalled();
    expect(rank).not.toHaveBeenCalled();
  });

  it("without a user id and under the cap the model is used; the Neurons go to the global counter only", async () => {
    const budget = fakeBudget();
    const res = await ask(run(two().c, good("a"), { budget }));
    expect(res).toMatchObject({ mode: "AI" });
    expect(res).not.toHaveProperty("aiSearches"); // no user, no counter
    expect(budget.reserveSearch).not.toHaveBeenCalled();
    expect(budget.added[0]![1]).toBeUndefined();
  });

  it("quota(): the budget's own answer, or the configured quota when there is no budget", async () => {
    const budget = fakeBudget({ left: { left: 1, limit: 4 } });
    expect(await run(two().c, null, { budget }).quota("u1")).toEqual({ left: 1, limit: 4 });
    expect(await run(two().c, null, { userQuota: 9 }).quota("u1")).toEqual({ left: 9, limit: 9 });
    expect(await run(two().c, null).quota("u1")).toEqual({ left: 0, limit: 0 });
  });
});

describe("discovery: result cache", () => {
  const two = () => catalog({ candidates: [cand("a", { foundBy: "semantic" }), cand("b")], mode: "hybrid" });

  it("a real AI ranking is cached for 15 minutes; the same request is then answered from the cache with fresh book data and no model call", async () => {
    const cache = memoryCache();
    const rank = vi.fn(async () => recs("b", "a"));
    const logs: Parameters<DiscoveryLog>[0][] = [];
    const svc = run(two().c, provider(rank as never), { cache, budget: fakeBudget() }, (e) => logs.push(e));
    const first = await ask(svc, {}, { userId: "u1" });
    expect(first).not.toHaveProperty("cached");
    expect([...cache.store.values()][0]!.ttl).toBe(RESULT_CACHE_TTL_SECONDS);
    const second = await ask(svc, { query: "  A book about WHALES! " }, { userId: "u1" }); // same normalised request
    expect(second).toMatchObject({
      cached: true,
      mode: "AI",
      tier: 1,
      retrieval: "hybrid",
      aiSearches: { left: 3, limit: 5 },
      note: "model note",
    });
    expect(second.items.map((i) => i.book.id)).toEqual(["b", "a"]);
    expect(second.items[1]).toMatchObject({ foundBy: "semantic" });
    expect(rank).toHaveBeenCalledTimes(1);
    expect(logs[1]).toMatchObject({ cacheHit: true, neurons: 0, retrieval: "hybrid" });
  });

  it("the cache key depends on the catalogue version, the limit, availability and the provider", async () => {
    const cache = memoryCache();
    const rank = vi.fn(async () => recs("a"));
    const mk = (version: string, name = "p1") =>
      run(catalog({ candidates: [cand("a"), cand("b")], version }).c, provider(rank as never, name), { cache });
    await ask(mk("v1"));
    await ask(mk("v2"));
    await ask(mk("v1"), { limit: 2 });
    await ask(mk("v1"), { availableOnly: true });
    await ask(mk("v1", "p2"));
    expect(rank).toHaveBeenCalledTimes(5);
    expect(cache.store.size).toBe(5);
    await ask(mk("v1"));
    expect(rank).toHaveBeenCalledTimes(5); // the first one again: a hit
  });

  it("no catalogue version, no cache: nothing is stored or read", async () => {
    const cache = memoryCache();
    const rank = vi.fn(async () => recs("a"));
    const svc = run(catalog({ candidates: [cand("a"), cand("b")], version: null }).c, provider(rank as never), {
      cache,
    });
    await ask(svc);
    await ask(svc);
    expect(rank).toHaveBeenCalledTimes(2);
    expect(cache.store.size).toBe(0);
  });

  it("fallbacks and empty answers are never cached", async () => {
    const cache = memoryCache();
    await ask(run(two().c, null, { cache }));
    await ask(
      run(
        two().c,
        provider(async () => ({ recommendations: [] })),
        { cache },
      ),
    );
    expect(cache.store.size).toBe(0);
  });

  it("unusable cache entries are treated as a miss: wrong version, no picks, a book that is gone, a cache that throws", async () => {
    const entries: unknown[] = [
      { v: 2, mode: "AI", note: null, picks: [{ id: "a", reason: "r", matchedTerms: [] }] },
      { v: 1, mode: "AI", note: null, picks: [] },
      { v: 1, mode: "AI", note: null, picks: "nope" },
      {
        v: 1,
        mode: "AI",
        note: null,
        picks: [
          { id: "a", reason: "r", matchedTerms: [] },
          { id: "gone", reason: "r", matchedTerms: [] },
        ],
      },
    ];
    for (const entry of entries) {
      const cache: AiCache = { get: async () => entry, set: vi.fn(async () => undefined) };
      const rank = vi.fn(async () => recs("a"));
      const res = await ask(
        run(catalog({ candidates: [cand("a"), cand("b")], missing: ["gone"] }).c, provider(rank as never), { cache }),
      );
      expect(res).not.toHaveProperty("cached");
      expect(rank).toHaveBeenCalledTimes(1);
    }
    const throwing: AiCache = {
      get: async () => {
        throw new Error("cache down");
      },
      set: async () => {
        throw new Error("cache down");
      },
    };
    const res = await ask(run(two().c, good("a"), { cache: throwing }));
    expect(res).toMatchObject({ mode: "AI", items: [{ book: { id: "a" } }] }); // neither the read nor the write failure reaches the user
  });

  it("a cache hit without any provider configured is still served and logged with no provider name", async () => {
    const logs: Parameters<DiscoveryLog>[0][] = [];
    const entry = { v: 1, mode: "FALLBACK", note: null, picks: [{ id: "a", reason: "r", matchedTerms: [] }] };
    const cache: AiCache = { get: async () => entry, set: async () => undefined };
    const res = await ask(run(two().c, null, { cache }, (e) => logs.push(e)));
    expect(res).toMatchObject({ cached: true, mode: "FALLBACK" });
    expect(logs[0]).toMatchObject({ cacheHit: true, provider: null });
  });

  it("a cached fallback-mode entry reports the tier of the retrieval it was made with", async () => {
    const cached = (retrieval?: "hybrid" | "lexical") => ({
      v: 1,
      mode: "FALLBACK",
      note: "n",
      ...(retrieval ? { retrieval } : {}),
      picks: [{ id: "a", reason: "r", matchedTerms: ["x"] }],
    });
    for (const [entry, tier] of [
      [cached("hybrid"), 2],
      [cached("lexical"), 3],
      [cached(), 3],
    ] as const) {
      const cache: AiCache = { get: async () => entry, set: async () => undefined };
      const res = await ask(run(two().c, good("a"), { cache }));
      expect(res).toMatchObject({ cached: true, mode: "FALLBACK", tier });
    }
  });
});

describe("index sync (store and embedder faked)", () => {
  const book = (id: string, over: Partial<IndexableBook> = {}): IndexableBook => ({
    id,
    title: `T${id}`,
    author: "A",
    category: "C",
    description: `About ${id}.`,
    ...over,
  });
  const embedder = (over: Partial<Embedder> = {}): Embedder & { embed: ReturnType<typeof vi.fn> } => {
    const e = {
      model: "m",
      dimensions: 3,
      queryPrefix: "",
      minSimilarity: 0.5,
      embed: vi.fn(async (texts: string[]) => texts.map(() => [1, 0, 0])),
      ...over,
    };
    return e as Embedder & { embed: ReturnType<typeof vi.fn> };
  };
  function store(
    o: {
      live?: IndexableBook[];
      indexed?: Map<string, string>;
      known?: Set<string>;
      pgvector?: boolean;
      removed?: number;
      applyFails?: boolean;
    } = {},
  ) {
    const applied: Array<Parameters<ChunkStore["apply"]>> = [];
    const s: ChunkStore = {
      liveBooks: vi.fn(async (ids?: string[]) => (o.live ?? []).filter((b) => !ids || ids.includes(b.id))),
      indexedHashes: async () => o.indexed ?? new Map(),
      knownHashes: async (hashes) => new Set([...(o.known ?? [])].filter((h) => hashes.includes(h))),
      apply: async (...args) => {
        if (o.applyFails) throw new Error("apply failed");
        applied.push(args);
        return o.removed ?? 0;
      },
      nearest: async () => [],
      similarTo: async () => [],
      usesPgvector: async () => o.pgvector ?? false,
    };
    return Object.assign(s, { applied });
  }

  it("enabled and vectorPath follow the embedder and the store", async () => {
    expect(new BookIndexSync(store(), null).enabled).toBe(false);
    expect(await new BookIndexSync(store(), null).vectorPath()).toBeNull();
    expect(new BookIndexSync(store(), embedder()).enabled).toBe(true);
    expect(await new BookIndexSync(store({ pgvector: true }), embedder()).vectorPath()).toBe("hnsw");
    expect(await new BookIndexSync(store({ pgvector: false }), embedder()).vectorPath()).toBe("brute-force");
  });

  it("with no embedder every operation is a no-op that never touches the store", async () => {
    const s = store({ live: [book("1")] });
    const sync = new BookIndexSync(s, null);
    expect(await sync.syncAll()).toEqual({
      embeddedBooks: 0,
      chunks: 0,
      reusedBooks: 0,
      upToDate: 0,
      removed: 0,
      neurons: 0,
      remaining: 0,
      total: 0,
    });
    await sync.syncBookSafely("1");
    expect(await sync.syncAllSafely()).toMatchObject({ total: 0 });
    expect(s.liveBooks).not.toHaveBeenCalled();
    expect(s.applied).toEqual([]);
  });

  it("embeds new books in a batch of at most N, reports what remains, charges the budget, and clamps a negative batch to zero", async () => {
    const live = [book("1"), book("2"), book("3")];
    const s = store({ live, removed: 4 });
    const emb = embedder();
    const budget = fakeBudget();
    const r = await new BookIndexSync(s, emb, undefined, budget).syncAll(2);
    expect(r).toMatchObject({
      embeddedBooks: 2,
      chunks: 2,
      reusedBooks: 0,
      upToDate: 0,
      removed: 4,
      remaining: 1,
      total: 3,
    });
    expect(r.neurons).toBeGreaterThan(0);
    expect(emb.embed).toHaveBeenCalledTimes(1);
    expect(s.applied[0]![1].embedded.map((e) => e.bookId)).toEqual(["1", "2"]);
    expect(s.applied[0]![1].embedded[0]!.rows[0]).toMatchObject({ index: 0, embedding: [1, 0, 0] });
    expect(budget.added).toHaveLength(1);
    const zero = await new BookIndexSync(store({ live }), embedder()).syncAll(-5);
    expect(zero).toMatchObject({ embeddedBooks: 0, remaining: 3, neurons: 0 });
    expect(DEFAULT_BATCH_BOOKS).toBe(8);
  });

  it("a book whose text another book already has is copied (no model call, no cost); an up-to-date book is left alone", async () => {
    const emb = embedder();
    const probeStore = store({ live: [book("1")] });
    await new BookIndexSync(probeStore, emb).syncAll(); // learn the hash that this text gets
    const donorHash = probeStore.applied[0]![1].embedded[0]!.hash;
    const twin = book("2", { title: "T1", description: "About 1." }); // same text, different id (what a demo reset produces)
    const s = store({ live: [book("1"), twin], indexed: new Map([["2", donorHash]]), known: new Set([donorHash]) });
    const emb2 = embedder();
    const budget = fakeBudget();
    const r = await new BookIndexSync(s, emb2, undefined, budget).syncAll();
    expect(r).toMatchObject({ embeddedBooks: 0, reusedBooks: 1, upToDate: 1, neurons: 0, remaining: 0 });
    expect(s.applied[0]![1].copied).toEqual([{ bookId: "1", hash: donorHash }]);
    expect(emb2.embed).not.toHaveBeenCalled();
    expect(budget.added).toEqual([]); // zero Neurons are not recorded
  });

  it("a budget write that fails does not fail the sync", async () => {
    const budget = fakeBudget({ addFails: true });
    const r = await new BookIndexSync(store({ live: [book("1")] }), embedder(), undefined, budget).syncAll();
    expect(r.embeddedBooks).toBe(1);
  });

  it("syncAllSafely logs only real work, and never throws (the failure is logged and null is returned)", async () => {
    const logs: Record<string, unknown>[] = [];
    const quiet = await new BookIndexSync(store(), embedder(), (e) => logs.push(e)).syncAllSafely();
    expect(quiet).toMatchObject({ total: 0 });
    expect(logs).toEqual([]); // the hourly top-up that finds nothing says nothing
    await new BookIndexSync(store({ live: [book("1")] }), embedder(), (e) => logs.push(e)).syncAllSafely();
    expect(logs[0]).toMatchObject({ level: "info", event: "book_index_sync", embeddedBooks: 1 });
    expect(
      await new BookIndexSync(store({ live: [book("1")], applyFails: true }), embedder(), (e) =>
        logs.push(e),
      ).syncAllSafely(),
    ).toBeNull();
    expect(logs[1]).toEqual({ level: "warn", event: "book_index_sync_failed", reason: "apply failed" });
    const nonError = embedder({
      embed: vi.fn(async () => {
        throw "string failure";
      }) as never,
    });
    expect(
      await new BookIndexSync(store({ live: [book("1")] }), nonError, (e) => logs.push(e)).syncAllSafely(),
    ).toBeNull();
    expect(logs[2]).toMatchObject({ reason: "error" });
  });

  it("syncBookSafely indexes one book; a failure is logged; a slow model is given up on after the timeout", async () => {
    const s = store({ live: [book("1"), book("2")] });
    await new BookIndexSync(s, embedder()).syncBookSafely("2");
    expect(s.liveBooks).toHaveBeenCalledWith(["2"]);
    expect(s.applied[0]![1].embedded.map((e) => e.bookId)).toEqual(["2"]);

    const logs: Record<string, unknown>[] = [];
    await new BookIndexSync(store({ live: [book("1")], applyFails: true }), embedder(), (e) =>
      logs.push(e),
    ).syncBookSafely("1");
    expect(logs[0]).toMatchObject({ event: "book_index_sync_failed", reason: "apply failed" });

    vi.useFakeTimers();
    const hang = embedder({ embed: vi.fn(() => new Promise(() => undefined)) as never });
    const pending = new BookIndexSync(store({ live: [book("1")] }), hang, (e) => logs.push(e)).syncBookSafely("1");
    await vi.advanceTimersByTimeAsync(BOOK_SYNC_TIMEOUT_MS - 1);
    expect(logs).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2);
    await pending;
    expect(logs[1]).toMatchObject({ level: "warn", reason: "timeout" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("syncBookSafely accepts its own timeout", async () => {
    vi.useFakeTimers();
    const logs: Record<string, unknown>[] = [];
    const hang = embedder({ embed: vi.fn(() => new Promise(() => undefined)) as never });
    const pending = new BookIndexSync(store({ live: [book("1")] }), hang, (e) => logs.push(e)).syncBookSafely("1", 10);
    await vi.advanceTimersByTimeAsync(11);
    await pending;
    expect(logs[0]).toMatchObject({ reason: "timeout" });
  });
});
