import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { BookDiscoveryService, quotaKeywordNote, quotaNote, type DiscoveryLog } from "../src/discovery/application/BookDiscoveryService";
import { BookIndexSync } from "../src/discovery/application/BookIndexSync";
import { HybridCatalogRetrieval, type RetrievalLog } from "../src/discovery/application/HybridCatalogRetrieval";
import { neuronsFor, normaliseQuery, WORST_CASE_RANK_NEURONS } from "../src/discovery/domain/Cost";
import type { AiProvider, Embedder } from "../src/discovery/domain/Discovery";
import { FakeAiProvider } from "../src/discovery/infrastructure/FakeAiProvider";
import { FakeEmbedder } from "../src/discovery/infrastructure/FakeEmbedder";
import { PgAiBudget, PgAiCache } from "../src/discovery/infrastructure/PgAiCost";
import { PgCatalogRetrieval } from "../src/discovery/infrastructure/PgCatalogRetrieval";
import { PgChunkStore } from "../src/discovery/infrastructure/PgChunkStore";
import { loadConfig } from "../src/platform/config";
import { createDb } from "../src/platform/db";
import { selectEmbedder } from "../src/discovery/infrastructure/selectProvider";
import { as, pool, resetDb, seedStaff, testApp, testEnv } from "./support";

afterAll(() => pool.end());

let now = new Date("2026-11-25T10:00:00Z");
const clock = () => now;
const db = () => createDb(pool);
const ids: Record<string, string> = {};
let staff: Awaited<ReturnType<typeof seedStaff>>;

async function addBook(key: string, title: string, category: string, description: string) {
  const r = await pool.query(`INSERT INTO books (title, author, category, description, total_copies, available_copies) VALUES ($1,'An Author',$2,$3,2,2) RETURNING id`, [title, category, description]);
  ids[key] = r.rows[0].id;
}

beforeEach(async () => {
  now = new Date("2026-11-25T10:00:00Z");
  await resetDb();
  staff = await seedStaff();
  await addBook("clean", "Clean Code", "Programming", "Readable code, naming and small functions.");
  await addBook("refactor", "Refactoring", "Programming", "Improving the design of existing code in small steps.");
  await addBook("pragmatic", "The Pragmatic Programmer", "Programming", "Practical advice on the craft of writing code.");
  await addBook("hawk", "H Is for Hawk", "Memoir", "After her father's sudden death, a naturalist works through her grief.");
});

/** A provider that counts its calls and reports usage like the real one. */
function countingProvider() {
  const fake = new FakeAiProvider();
  const p: AiProvider & { calls: number } = { name: "fake", calls: 0, rank: async (r) => { p.calls++; return fake.rank(r); } };
  return p;
}
function countingEmbedder() {
  const fake = new FakeEmbedder();
  const e = Object.assign(Object.create(fake) as Embedder, { calls: 0 });
  e.embed = async (texts: string[]) => { (e as { calls: number }).calls++; return fake.embed(texts); };
  return e as Embedder & { calls: number };
}

function setup(opts: { cap?: number; quota?: number; embedder?: Embedder; provider?: AiProvider } = {}) {
  const budget = new PgAiBudget(db(), clock, opts.cap ?? 8000, opts.quota ?? 50);
  const cache = new PgAiCache(db(), clock);
  const retrievalLogs: Parameters<RetrievalLog>[0][] = [];
  const logs: Parameters<DiscoveryLog>[0][] = [];
  const embedder = opts.embedder ?? new FakeEmbedder();
  const retrieval = new HybridCatalogRetrieval(new PgCatalogRetrieval(db()), new PgChunkStore(db()), embedder, (e) => retrievalLogs.push(e), undefined, { cache, budget });
  const provider = (opts.provider ?? countingProvider()) as AiProvider & { calls: number };
  const service = new BookDiscoveryService(retrieval, provider, (e) => logs.push(e), 8000, { cache, budget, userQuota: opts.quota ?? 50 });
  return { service, budget, cache, logs, retrievalLogs, provider, embedder };
}
const index = () => new BookIndexSync(new PgChunkStore(db()), new FakeEmbedder()).syncAll(10_000);
const usageRow = async (scope: string) => (await pool.query("SELECT searches, neurons::float AS neurons FROM ai_usage WHERE scope = $1", [scope])).rows[0];

describe("SLM-16 cost: price estimate", () => {
  it("prices calls in Neurons from Cloudflare's published rates", () => {
    expect(neuronsFor({ model: "@cf/meta/llama-3.2-3b-instruct", inputTokens: 1700, outputTokens: 600, estimated: true })).toBeCloseTo(26.15, 1);
    expect(neuronsFor({ model: "@cf/baai/bge-base-en-v1.5", inputTokens: 20, outputTokens: 0, estimated: true })).toBeCloseTo(0.12, 2);
    expect(WORST_CASE_RANK_NEURONS).toBe(26);
  });
  it("normalises queries for cache keys (case, spacing, edge punctuation)", () => {
    expect(normaliseQuery("  Clean   CODE for juniors?! ")).toBe("clean code for juniors");
  });
});

describe("SLM-16 cost: result cache", () => {
  it("the same request within 15 minutes is answered from the cache: the model is called once, books re-read", async () => {
    await index();
    const { service, provider, logs } = setup();
    const first = await service.discover({ query: "readable code" }, { userId: staff.librarian });
    expect(first.mode).toBe("AI");
    const second = await service.discover({ query: "  Readable CODE " }, { userId: staff.librarian });
    expect(provider.calls).toBe(1);
    expect(second).toMatchObject({ mode: "AI", cached: true });
    expect(second.items.map((i) => i.book.id)).toEqual(first.items.map((i) => i.book.id));
    expect(logs[1]).toMatchObject({ cacheHit: true, neurons: 0 });
    expect((await usageRow(`user:${staff.librarian}`)).searches).toBe(1); // a cache hit doesn't use the quota
  });

  it("expires after 15 minutes, and a catalogue change invalidates it", async () => {
    const { service, provider } = setup();
    await service.discover({ query: "readable code" }, { userId: staff.librarian });
    now = new Date(now.getTime() + 16 * 60_000);
    await service.discover({ query: "readable code" }, { userId: staff.librarian });
    expect(provider.calls).toBe(2);
    await pool.query("UPDATE books SET description = 'Changed', updated_at = now() + interval '1 second' WHERE id = $1", [ids.clean]);
    await service.discover({ query: "readable code" }, { userId: staff.librarian });
    expect(provider.calls).toBe(3);
  });

  it("is never used for a member-specific request (the prompt holds that member's reading)", async () => {
    const m = await pool.query("INSERT INTO members (full_name, email) VALUES ('Mona Test', 'mona@example.com') RETURNING id");
    const { service, provider } = setup();
    await service.discover({ query: "readable code", memberId: m.rows[0].id }, { userId: staff.librarian });
    await service.discover({ query: "readable code", memberId: m.rows[0].id }, { userId: staff.librarian });
    expect(provider.calls).toBe(2);
  });

  it("the query embedding is computed once per normalised query (one embedding call per new query)", async () => {
    await index();
    const embedder = countingEmbedder();
    const { service, retrievalLogs } = setup({ embedder });
    await service.discover({ query: "a memoir about grief" }, { userId: staff.librarian });
    await service.discover({ query: "A memoir about GRIEF", availableOnly: true }, { userId: staff.librarian }); // other result key, same text
    expect(embedder.calls).toBe(1);
    expect(retrievalLogs.map((l) => l.embeddingCacheHit)).toEqual([false, true]);
  });
});

describe("SLM-16 cost: skip the model when it adds nothing", () => {
  it("one candidate: no model call, an info note", async () => {
    const { service, provider } = setup({ embedder: undefined });
    const r = await service.discover({ query: "naturalist" }, { userId: staff.librarian });
    expect(r.items).toHaveLength(1);
    expect(r).toMatchObject({ mode: "FALLBACK", fallbackReason: "SINGLE_CANDIDATE" });
    expect(provider.calls).toBe(0);
  });
});

describe("SLM-16 cost: per-user daily quota", () => {
  it("past the quota the user gets the search ranking with a clear note (not an error); others are unaffected", async () => {
    const { service, provider } = setup({ quota: 2 });
    for (const q of ["readable code", "existing code design", "craft of code"]) await service.discover({ query: q }, { userId: staff.librarian });
    const over = await service.discover({ query: "small functions code" }, { userId: staff.librarian });
    expect(over).toMatchObject({ mode: "FALLBACK", fallbackReason: "QUOTA_EXCEEDED", note: quotaNote(2) });
    expect(over.items.length).toBeGreaterThan(0);
    expect(provider.calls).toBe(2);
    expect((await service.discover({ query: "small functions code" }, { userId: staff.admin })).mode).toBe("AI");
  });

  it("the quota resets on the next UTC day", async () => {
    const { service } = setup({ quota: 1 });
    await service.discover({ query: "readable code" }, { userId: staff.librarian });
    expect((await service.discover({ query: "existing code" }, { userId: staff.librarian })).fallbackReason).toBe("QUOTA_EXCEEDED");
    now = new Date("2026-11-26T00:00:01Z");
    expect((await service.discover({ query: "existing code" }, { userId: staff.librarian })).mode).toBe("AI");
  });

  it("concurrent requests can't both take the last slot", async () => {
    const budget = new PgAiBudget(db(), clock, 8000, 3);
    const verdicts = await Promise.all(Array.from({ length: 10 }, () => budget.reserveSearch(staff.librarian)));
    expect(verdicts.filter((v) => v === "OK")).toHaveLength(3);
  });
});

describe("SLM-16 cost: global daily Neuron cap", () => {
  it("records the Neurons of each call; at the cap everyone gets the fallback and query embeddings stop", async () => {
    await index();
    const { service, budget, logs, retrievalLogs } = setup({ cap: 10 });
    const first = await service.discover({ query: "readable code" }, { userId: staff.librarian });
    expect(first.mode).toBe("AI");
    expect(logs[0]!.neurons).toBeGreaterThan(10); // one fake ranking ≈ real Llama pricing
    expect((await budget.today()).neurons).toBeGreaterThan(10);

    const after = await service.discover({ query: "existing code design" }, { userId: staff.admin });
    expect(after).toMatchObject({ mode: "FALLBACK", fallbackReason: "BUDGET_EXHAUSTED", retrieval: "lexical" });
    expect(retrievalLogs[1]).toMatchObject({ retrieval: "lexical", fallbackReason: "BUDGET_EXHAUSTED" });
  });

  it("a timed-out call is charged at the worst case", async () => {
    const slow: AiProvider = { name: "slow", rank: () => new Promise(() => undefined) };
    const budget = new PgAiBudget(db(), clock, 8000, 50);
    const service = new BookDiscoveryService(new PgCatalogRetrieval(db()), slow, () => undefined, 20, { budget, userQuota: 50 });
    expect((await service.discover({ query: "readable code" }, { userId: staff.librarian })).fallbackReason).toBe("TIMEOUT");
    expect((await budget.today()).neurons).toBe(WORST_CASE_RANK_NEURONS);
  });
});

describe("SLM-16 cost: indexing", () => {
  it("a demo reset (same texts, new ids) copies vectors: no embedding call, 0 Neurons", async () => {
    await index();
    // What the reset does: the same seed texts come back under new ids.
    await pool.query("DELETE FROM books");
    await addBook("clean", "Clean Code", "Programming", "Readable code, naming and small functions.");
    await addBook("refactor", "Refactoring", "Programming", "Improving the design of existing code in small steps.");
    const embedder = countingEmbedder();
    const r = await new BookIndexSync(new PgChunkStore(db()), embedder).syncAll();
    expect(r).toMatchObject({ embeddedBooks: 0, reusedBooks: 2, neurons: 0 });
    expect(embedder.calls).toBe(0);
    const { rows } = await pool.query("SELECT DISTINCT book_id FROM book_chunks");
    expect(rows.map((x) => x.book_id).sort()).toEqual([ids.clean, ids.refactor].sort()); // old ids' chunks removed
  });

  it("threshold contract on the seed: «losing a parent» finds the memoirs; an unrelated query gets ≤ 2 vector hits", async () => {
    await pool.query("DELETE FROM books");
    await pool.query(await readFile(fileURLToPath(new URL("../../seed/demo.sql", import.meta.url).href), "utf8"));
    await index();
    const logs: Parameters<RetrievalLog>[0][] = [];
    const r = new HybridCatalogRetrieval(new PgCatalogRetrieval(db()), new PgChunkStore(db()), new FakeEmbedder(), (e) => logs.push(e));
    const grief = await r.candidates("a book for someone losing a parent", { limit: 20, availableOnly: false });
    const memoirs = grief.filter((c) => c.category === "Memoir");
    expect(memoirs.length).toBeGreaterThanOrEqual(2);
    expect(memoirs.every((c) => c.foundBy === "semantic")).toBe(true);
    const unrelated = await r.candidates("quantum chromodynamics", { limit: 20, availableOnly: false });
    expect(unrelated.filter((c) => c.foundBy === "semantic" || c.foundBy === "both").length).toBeLessThanOrEqual(2);
  });
});

describe("SLM-16 cost: API", () => {
  it("Admin reads today's usage; the reindex endpoint is limited to 2 a minute", async () => {
    const app = testApp({ env: { AI_FAKE: "true" } });
    await app.request("/api/ai/book-discovery", await as(staff.librarian, { method: "POST", body: { query: "readable code" } }));
    const u = await app.request("/api/admin/discovery/usage", await as(staff.admin));
    expect(u.status).toBe(200);
    const body = (await u.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ searches: 1, neuronCap: 8000, userQuota: 50, vectorPath: "brute-force" });
    expect(body.neurons as number).toBeGreaterThan(0);

    const reindex = async () => (await app.request("/api/admin/discovery/reindex", await as(staff.admin, { method: "POST", body: {} }))).status;
    expect([await reindex(), await reindex(), await reindex()]).toEqual([200, 200, 429]);
  });

  it("deep health reports the vector search path", async () => {
    const res = await testApp({ env: { AI_FAKE: "true" } }).request("/api/health?deep=1");
    expect(await res.json()).toMatchObject({ status: "ok", vector: "brute-force" });
  });
});

describe("SLM-16 cost tiers (Ahmed, 25/11)", () => {
  beforeEach(() => addBook("hmart", "Crying in H Mart", "Memoir", "A musician remembers her Korean mother through food, illness and mourning."));

  it("tier 1: hybrid retrieval + AI ranking with reasons; the response says how many AI searches are left", async () => {
    await index();
    const { service } = setup({ quota: 50 });
    const r = await service.discover({ query: "a memoir about grief" }, { userId: staff.librarian });
    expect(r).toMatchObject({ mode: "AI", tier: 1, retrieval: "hybrid", aiSearches: { left: 49, limit: 50 } });
  });

  it("tier 2: past the user's quota → hybrid retrieval ranked by RRF, no model call, ≈0.1 Neuron", async () => {
    await index();
    const { service, provider, logs } = setup({ quota: 0 });
    const r = await service.discover({ query: "a book for someone losing a parent" }, { userId: staff.librarian });
    expect(r).toMatchObject({ mode: "FALLBACK", tier: 2, retrieval: "hybrid", fallbackReason: "QUOTA_EXCEEDED", aiSearches: { left: 0, limit: 0 } });
    expect(r.items.some((i) => i.book.id === ids.hawk && i.foundBy === "semantic")).toBe(true); // still found by meaning
    expect(provider.calls).toBe(0);
    expect(logs[0]!.neurons).toBeLessThan(1);
  });

  it("quota used up while embeddings are down: the note says keywords, not meaning (it follows the tier served)", async () => {
    await index();
    const broken: Embedder = { model: "fake-embedding-v1", dimensions: 768, queryPrefix: "", minSimilarity: 0.2, embed: async () => { throw new Error("AI down"); } };
    const { service } = setup({ quota: 0, embedder: broken });
    const r = await service.discover({ query: "readable code" }, { userId: staff.librarian });
    expect(r).toMatchObject({ tier: 3, retrieval: "lexical", fallbackReason: "QUOTA_EXCEEDED", note: quotaKeywordNote(0) });
  });

  it("tier 3: past the library's daily budget → keyword retrieval, deterministic ranking, no AI call at all", async () => {
    await index();
    const embedder = countingEmbedder();
    const { service, budget, provider } = setup({ cap: 5, embedder });
    await budget.addNeurons(5);
    const r = await service.discover({ query: "readable code" }, { userId: staff.librarian });
    expect(r).toMatchObject({ mode: "FALLBACK", tier: 3, retrieval: "lexical", fallbackReason: "BUDGET_EXHAUSTED" });
    expect(r.items[0]!.book.id).toBe(ids.clean);
    expect(provider.calls + embedder.calls).toBe(0);
  });

  it("GET /api/ai/quota gives the counter its starting value; each AI search uses one", async () => {
    const app = testApp({ env: { AI_FAKE: "true", AI_USER_DAILY_SEARCHES: "3" } });
    const quota = async () => (await (await app.request("/api/ai/quota", await as(staff.supervisor))).json()) as { left: number; limit: number };
    expect(await quota()).toEqual({ left: 3, limit: 3 });
    const res = await app.request("/api/ai/book-discovery", await as(staff.supervisor, { method: "POST", body: { query: "readable code" } }));
    expect(((await res.json()) as { aiSearches: unknown }).aiSearches).toEqual({ left: 2, limit: 3 });
    expect(await quota()).toEqual({ left: 2, limit: 3 });
  });
});

describe("SLM-16 indexing within Workers Free CPU (10 ms per call)", () => {
  it("reindex embeds at most N books per call, reports what's left, and resumes until done", async () => {
    const sync = new BookIndexSync(new PgChunkStore(db()), new FakeEmbedder());
    expect(await sync.syncAll(3)).toMatchObject({ embeddedBooks: 3, remaining: 1 });
    expect(await sync.syncAll(3)).toMatchObject({ embeddedBooks: 1, remaining: 0, upToDate: 3 });
    expect(await sync.syncAll(3)).toMatchObject({ embeddedBooks: 0, remaining: 0, upToDate: 4 });
  });

  it("the endpoint takes ?limit and says partial/done", async () => {
    const app = testApp({ env: { AI_FAKE: "true" } });
    const r1 = await (await app.request("/api/admin/discovery/reindex?limit=2", await as(staff.admin, { method: "POST", body: {} }))).json();
    expect(r1).toMatchObject({ result: "partial", embeddedBooks: 2, remaining: 2 });
    const r2 = await (await app.request("/api/admin/discovery/reindex", await as(staff.admin, { method: "POST", body: {} }))).json();
    expect(r2).toMatchObject({ result: "done", embeddedBooks: 2, remaining: 0 });
  });
});

describe("SLM-16 config", () => {
  it("the semantic threshold comes from EMBEDDING_MIN_SIMILARITY (default 0.72)", () => {
    const binding = { run: async () => ({}) };
    expect(selectEmbedder(loadConfig(testEnv), binding)!.minSimilarity).toBe(0.72);
    expect(selectEmbedder(loadConfig({ ...testEnv, EMBEDDING_MIN_SIMILARITY: "0.75" }), binding)!.minSimilarity).toBe(0.75);
    expect(() => loadConfig({ ...testEnv, EMBEDDING_MIN_SIMILARITY: "1.5" })).toThrow(/EMBEDDING_MIN_SIMILARITY/);
  });

  it("refuses an embedding model whose size doesn't match the vector(768) index", () => {
    expect(() => loadConfig({ ...testEnv, EMBEDDING_MODEL: "@cf/baai/bge-m3" })).toThrow(/1024 dimensions/);
    expect(() => loadConfig({ ...testEnv, EMBEDDING_MODEL: "@cf/baai/bge-base-en-v1.5" })).not.toThrow();
  });

  it("the cost numbers come from config", () => {
    const c = loadConfig({ ...testEnv, AI_DAILY_NEURON_CAP: "1234", AI_USER_DAILY_SEARCHES: "7", INDEX_BATCH_BOOKS: "9" });
    expect(c).toMatchObject({ aiDailyNeuronCap: 1234, aiUserDailySearches: 7, indexBatchBooks: 9 });
    expect(loadConfig(testEnv)).toMatchObject({ aiDailyNeuronCap: 8000, aiUserDailySearches: 50, indexBatchBooks: 16 });
  });
});

describe("SLM-16 demo queries for the assessors (full seed; foundBy as documented in docs/ai.md)", () => {
  const foundBy = async (query: string) => {
    const r = new HybridCatalogRetrieval(new PgCatalogRetrieval(db()), new PgChunkStore(db()), new FakeEmbedder());
    return new Map((await r.candidates(query, { limit: 20, availableOnly: false })).map((c) => [c.title, c.foundBy]));
  };
  beforeEach(async () => {
    await pool.query("DELETE FROM books");
    await pool.query(await readFile(fileURLToPath(new URL("../../seed/demo.sql", import.meta.url).href), "utf8"));
    await index();
  });

  it("keyword only: an author typo «Daniel Kahnemann» finds Kahneman's book through trigram similarity", async () => {
    expect((await foundBy("Daniel Kahnemann")).get("Thinking, Fast and Slow")).toBe("lexical");
  });
  it("meaning only: «a book for someone who is losing a parent» finds the grief memoirs", async () => {
    const m = await foundBy("a book for someone who is losing a parent");
    expect(m.get("H Is for Hawk")).toBe("semantic");
    expect(m.get("Crying in H Mart")).toBe("semantic");
  });
  it("both: «a memoir about grief and mourning»", async () => {
    expect((await foundBy("a memoir about grief and mourning")).get("A Grief Observed")).toBe("both");
  });
});

