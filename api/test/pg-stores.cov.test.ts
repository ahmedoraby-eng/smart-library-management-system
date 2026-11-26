import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { BookStock } from "../src/catalog/domain/BookStock";
import { PgBookStock, pgBookStockFor } from "../src/catalog/infrastructure/PgBookStock";
import { PgCirculationStore } from "../src/circulation/infrastructure/PgCirculationStore";
import { PgAiBudget, PgAiCache } from "../src/discovery/infrastructure/PgAiCost";
import { matchedTermsOf, PgCatalogRetrieval, queryTerms } from "../src/discovery/infrastructure/PgCatalogRetrieval";
import { createDb, PgCode, pgError, type DbOrTx } from "../src/platform/db";
import { AppError } from "../src/platform/errors";
import { pool, resetDb, seedStaff } from "./support";

afterAll(() => pool.end());

const db = () => createDb(pool);
const NIL = "00000000-0000-0000-0000-000000000000";
let staff: Awaited<ReturnType<typeof seedStaff>>;
let memberSeq = 0;

async function addBook(
  title: string,
  o: {
    author?: string;
    category?: string;
    description?: string;
    total?: number;
    available?: number;
    archived?: boolean;
    year?: number | null;
    cover?: string | null;
  } = {},
) {
  const r = await pool.query(
    `INSERT INTO books (title, author, category, description, total_copies, available_copies, archived_at, publication_year, cover_image_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [
      title,
      o.author ?? "An Author",
      o.category ?? "General",
      o.description ?? "",
      o.total ?? 3,
      o.available ?? o.total ?? 3,
      o.archived ? new Date() : null,
      o.year ?? null,
      o.cover ?? null,
    ],
  );
  return r.rows[0].id as string;
}
async function addMember(status = "ACTIVE") {
  memberSeq++;
  return (
    await pool.query("INSERT INTO members (full_name, email, status) VALUES ($1,$2,$3) RETURNING id", [
      `Member ${memberSeq}`,
      `m${memberSeq}@x.test`,
      status,
    ])
  ).rows[0].id as string;
}
async function addLoan(
  bookId: string,
  memberId: string,
  o: { borrowed?: string; due?: string; returned?: string | null } = {},
) {
  const borrowed = o.borrowed ?? "2026-11-01T10:00:00Z";
  const returned = o.returned ?? null;
  return (
    await pool.query(
      `INSERT INTO loans (book_id, member_id, processed_by, returned_by, borrowed_at, due_at, returned_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [
        bookId,
        memberId,
        staff.librarian,
        returned ? staff.supervisor : null,
        borrowed,
        o.due ?? "2026-12-01T10:00:00Z",
        returned,
      ],
    )
  ).rows[0].id as string;
}

beforeEach(async () => {
  await resetDb();
  staff = await seedStaff();
});

describe("PgAiBudget", () => {
  let now = new Date("2026-11-25T10:00:00Z");
  const clock = () => now;
  const budget = (cap = 100, quota = 2) => new PgAiBudget(db(), clock, cap, quota);
  beforeEach(() => {
    now = new Date("2026-11-25T10:00:00Z");
  });

  it("today() is all zeros on a fresh day and echoes the configured limits; neurons are rounded to one decimal", async () => {
    expect(await budget(100, 2).today()).toEqual({
      day: "2026-11-25",
      searches: 0,
      neurons: 0,
      neuronCap: 100,
      userQuota: 2,
    });
    await budget().addNeurons(1.2345);
    await budget().addNeurons(0.1);
    expect((await budget().today()).neurons).toBe(1.3); // 1.335 → 1.3
  });

  it("addNeurons ignores zero, negative and non-numbers; with a user it adds to both the global and the user's row", async () => {
    for (const n of [0, -1, Number.NaN]) await budget().addNeurons(n, "u1");
    expect((await pool.query("SELECT 1 FROM ai_usage")).rowCount).toBe(0);
    await budget().addNeurons(2, "u1");
    await budget().addNeurons(3);
    const rows = Object.fromEntries(
      (await pool.query("SELECT scope, neurons::float AS n FROM ai_usage")).rows.map((r) => [r.scope, r.n]),
    );
    expect(rows).toEqual({ global: 5, "user:u1": 2 });
  });

  it("underCap is strict: at the cap the budget is spent", async () => {
    expect(await budget(5).underCap()).toBe(true);
    await budget(5).addNeurons(4.999);
    expect(await budget(5).underCap()).toBe(true);
    await budget(5).addNeurons(0.001);
    expect(await budget(5).underCap()).toBe(false);
  });

  it("reserveSearch counts per user up to the quota, then refuses without touching the global counter; other users are unaffected", async () => {
    expect(await budget().reserveSearch("u1")).toBe("OK");
    expect(await budget().reserveSearch("u1")).toBe("OK");
    expect(await budget().reserveSearch("u1")).toBe("QUOTA_EXCEEDED");
    expect(await budget().reserveSearch("u1")).toBe("QUOTA_EXCEEDED");
    expect(await budget().reserveSearch("u2")).toBe("OK");
    expect((await budget().today()).searches).toBe(3); // refused searches are not counted
    expect(await budget().searchesLeft("u1")).toEqual({ left: 0, limit: 2 });
    expect(await budget().searchesLeft("u2")).toEqual({ left: 1, limit: 2 });
    expect(await budget().searchesLeft("never-seen")).toEqual({ left: 2, limit: 2 });
  });

  it("reserveSearch refuses everyone with BUDGET_EXHAUSTED once the Neuron cap is reached, without reserving a slot", async () => {
    await budget(10).addNeurons(10);
    expect(await budget(10).reserveSearch("u1")).toBe("BUDGET_EXHAUSTED");
    expect(await budget(10).searchesLeft("u1")).toEqual({ left: 2, limit: 2 });
  });

  it("a quota of zero never allows a search", async () => {
    expect(await budget(100, 0).reserveSearch("u1")).toBe("QUOTA_EXCEEDED");
    expect(await budget(100, 0).reserveSearch("u1")).toBe("QUOTA_EXCEEDED");
    expect((await budget(100, 0).searchesLeft("u1")).left).toBe(0);
    expect((await budget(100, 0).today()).searches).toBe(0);
  });

  it("counters are per UTC day: the next day starts clean, the old day is kept", async () => {
    await budget().reserveSearch("u1");
    await budget().addNeurons(7, "u1");
    now = new Date("2026-11-26T00:00:01Z");
    expect(await budget().today()).toMatchObject({ day: "2026-11-26", searches: 0, neurons: 0 });
    expect(await budget().searchesLeft("u1")).toEqual({ left: 2, limit: 2 });
    now = new Date("2026-11-25T23:59:59Z");
    expect(await budget().today()).toMatchObject({ searches: 1, neurons: 7 });
  });
});

describe("PgAiCache", () => {
  let now = new Date("2026-11-25T10:00:00Z");
  const cache = () => new PgAiCache(db(), () => now);
  beforeEach(() => {
    now = new Date("2026-11-25T10:00:00Z");
  });

  it("stores JSON values until the TTL; a miss reads as null; set again replaces value and expiry", async () => {
    expect(await cache().get("k")).toBeNull();
    await cache().set("k", { v: 1, picks: [{ id: "a" }] }, 60);
    expect(await cache().get("k")).toEqual({ v: 1, picks: [{ id: "a" }] });
    now = new Date(now.getTime() + 59_000);
    expect(await cache().get("k")).not.toBeNull();
    await cache().set("k", [1, 2, 3], 10);
    expect(await cache().get("k")).toEqual([1, 2, 3]);
    now = new Date(now.getTime() + 10_000); // expires_at == now counts as expired
    expect(await cache().get("k")).toBeNull();
    await cache().set("s", "text", 5);
    await cache().set("n", null, 5);
    expect(await cache().get("s")).toBe("text");
    expect(await cache().get("n")).toBeNull();
  });

  it("purgeExpired removes only expired rows and says how many", async () => {
    await cache().set("old1", 1, 10);
    await cache().set("old2", 2, 20);
    await cache().set("fresh", 3, 3600);
    now = new Date(now.getTime() + 30_000);
    expect(await cache().purgeExpired()).toBe(2);
    expect(await cache().purgeExpired()).toBe(0);
    expect(await cache().get("fresh")).toBe(3);
  });
});

describe("catalogue text helpers", () => {
  it("queryTerms keeps letters and digits only, drops stop words and short words, dedupes, caps at 12", () => {
    expect(queryTerms("Books about Software Architecture, for the beginner!")).toEqual([
      "software",
      "architecture",
      "beginner",
    ]);
    expect(queryTerms("a | b & !c ; DROP')")).toEqual(["drop"]); // no tsquery operator survives
    expect(queryTerms("Dune dune DUNE")).toEqual(["dune"]);
    expect(queryTerms("Édition الكتب 2024 ab")).toEqual(["édition", "الكتب", "2024"]);
    expect(queryTerms("")).toEqual([]);
    expect(queryTerms(Array.from({ length: 20 }, (_, i) => `word${i}`).join(" "))).toHaveLength(12);
  });

  it("matchedTermsOf matches words by prefix (longer terms lose two letters), at most four", () => {
    expect(matchedTermsOf(["architecture", "design"], "Software Architectures and Patterns")).toEqual(["architecture"]);
    expect(matchedTermsOf(["dune"], "Dunes of Arrakis")).toEqual(["dune"]); // short terms: exact prefix
    expect(matchedTermsOf(["dunes"], "Dune")).toEqual([]); // a longer request word is not a prefix of the shorter text word
    expect(matchedTermsOf(["alpha", "beta", "gamma", "delta", "omega"], "alpha beta gamma delta omega")).toHaveLength(
      4,
    );
    expect(matchedTermsOf([], "text")).toEqual([]);
    expect(matchedTermsOf(["x"], "")).toEqual([]);
  });
});

describe("PgCatalogRetrieval", () => {
  const retrieval = () => new PgCatalogRetrieval(db());
  const opts = { limit: 10, availableOnly: false };

  it("hits: stop-word-only requests fall back to title similarity alone (no full-text query to build)", async () => {
    const find = await addBook("Find", { description: "A book called find." });
    await addBook("Unrelated Title");
    const hits = await retrieval().hits("find", opts);
    expect(hits.map((h) => h.id)).toEqual([find]);
    expect(hits[0]!.matchedTerms).toEqual([]);
    expect(hits[0]!.related).toBe(false);
    expect(await retrieval().hits("!!! ???", opts)).toEqual([]);
    expect(await retrieval().hits("", opts)).toEqual([]);
  });

  it("hits: descriptions are cut to 200 characters, missing years stay null, archived books never match, availableOnly filters", async () => {
    await addBook("Whale Tales", { description: "whale ".repeat(100), year: 1851, available: 0, total: 1 });
    await addBook("Whale Songs", { description: "whale songs", available: 1, total: 1 });
    await addBook("Whale Hidden", { description: "whale", archived: true });
    const all = await retrieval().hits("whale", opts);
    expect(all.map((h) => h.title).sort()).toEqual(["Whale Songs", "Whale Tales"]);
    expect(all.find((h) => h.title === "Whale Tales")).toMatchObject({ publicationYear: 1851 });
    expect(all.find((h) => h.title === "Whale Tales")!.description).toHaveLength(200);
    expect(all.find((h) => h.title === "Whale Songs")!.publicationYear).toBeNull();
    expect(all[0]!.score).toBeGreaterThanOrEqual(0.002); // a real match never scores below the top-up floor
    expect((await retrieval().hits("whale", { ...opts, availableOnly: true })).map((h) => h.title)).toEqual([
      "Whale Songs",
    ]);
    expect(await retrieval().hits("whale", { limit: 1, availableOnly: false })).toHaveLength(1);
  });

  it("hits find a typo in a title through trigram similarity", async () => {
    const id = await addBook("Frankenstein", { description: "A monster." });
    expect((await retrieval().hits("frankenstien", opts)).map((h) => h.id)).toEqual([id]);
  });

  it("candidates: with fewer than five hits the list is topped up from the hits' categories, marked related and ranked last", async () => {
    const hit = await addBook("Quasar Atlas", { category: "Astronomy", description: "quasar" });
    const sibling = await addBook("Nebula Guide", { category: "Astronomy", description: "gas clouds", available: 3 });
    await addBook("Cooking Basics", { category: "Cooking", description: "eggs" });
    const out = await retrieval().candidates("quasar", opts);
    expect(out.map((c) => c.id)).toEqual([hit, sibling]);
    expect(out[0]).toMatchObject({ related: false, matchedTerms: ["quasar"] });
    expect(out[1]).toMatchObject({ related: true, score: 0.001, matchedTerms: [] });
  });

  it("candidates: no hits at all → books of a category that resembles the request; none resembling → empty; availableOnly applies to the top-up", async () => {
    const inStock = await addBook("Verses One", { category: "Poetry", available: 2 });
    const outOfStock = await addBook("Verses Two", { category: "Poetry", available: 0 });
    await addBook("Pie Recipes", { category: "Cooking" });
    const out = await retrieval().candidates("poetyr", opts);
    expect(out.map((c) => c.id).sort()).toEqual([inStock, outOfStock].sort());
    expect(out[0]!.id).toBe(inStock); // in-stock first
    expect(out.every((c) => c.related)).toBe(true);
    expect((await retrieval().candidates("poetyr", { limit: 10, availableOnly: true })).map((c) => c.id)).toEqual([
      inStock,
    ]);
    expect(await retrieval().candidates("zzzzqqq", opts)).toEqual([]);
  });

  it("topUp never repeats a book already in hand and honours the remaining room", async () => {
    const a = await addBook("A1", { category: "Poetry" });
    await addBook("A2", { category: "Poetry" });
    await addBook("A3", { category: "Poetry" });
    const have = [
      {
        id: a,
        title: "A1",
        author: "x",
        category: "Poetry",
        publicationYear: null,
        description: "",
        score: 1,
        matchedTerms: [],
        related: false,
      },
    ];
    const more = await retrieval().topUp("poetry", have, { limit: 2, availableOnly: false });
    expect(more).toHaveLength(1); // limit 2 minus 1 in hand
    expect(more.map((m) => m.id)).not.toContain(a);
    expect(await retrieval().topUp("poetry", have, { limit: 1, availableOnly: false })).toEqual([]);
    expect(await retrieval().topUp("poetry", have, { limit: 0, availableOnly: false })).toEqual([]);
  });

  it("byIds: keeps the caller's order, ignores malformed, unknown and archived ids, honours availableOnly; empty input is no query", async () => {
    const a = await addBook("Alpha", { description: "alpha" });
    const b = await addBook("Beta", { available: 0, total: 1 });
    const gone = await addBook("Gone", { archived: true });
    expect(
      (await retrieval().byIds([b, a, gone, NIL, "bad-id"], "alpha", { availableOnly: false })).map((c) => c.id),
    ).toEqual([b, a]);
    expect((await retrieval().byIds([b, a], "alpha", { availableOnly: true })).map((c) => c.id)).toEqual([a]);
    expect((await retrieval().byIds([a], "alpha", { availableOnly: false }))[0]).toMatchObject({
      matchedTerms: ["alpha"],
      related: false,
    });
    expect(await retrieval().byIds([], "alpha", { availableOnly: false })).toEqual([]);
    expect(await retrieval().byIds(["bad-id"], "alpha", { availableOnly: false })).toEqual([]);
  });

  it("catalogueVersion: a fixed value for an empty catalogue, and a new one after an add, an edit, a stock change or an archive", async () => {
    expect(await retrieval().catalogueVersion()).toBe("0:0:0");
    const id = await addBook("V1", { total: 2 });
    const v1 = await retrieval().catalogueVersion();
    expect(v1).toMatch(/^1:\d+:2$/);
    await pool.query("UPDATE books SET available_copies = 1, updated_at = now() + interval '1 second' WHERE id = $1", [
      id,
    ]);
    const v2 = await retrieval().catalogueVersion();
    expect(v2).not.toBe(v1);
    await pool.query("UPDATE books SET archived_at = now() WHERE id = $1", [id]);
    expect(await retrieval().catalogueVersion()).toBe("0:0:0");
  });

  it("summaries: fresh availability, cover and next due date from the earliest open loan; malformed, unknown and archived ids are absent", async () => {
    const a = await addBook("Sum A", { total: 3, available: 1, year: 1999, cover: "https://img.example/a.jpg" });
    const b = await addBook("Sum B", { total: 1, available: 1 });
    const gone = await addBook("Sum Gone", { archived: true });
    const m1 = await addMember();
    const m2 = await addMember();
    const m3 = await addMember();
    await addLoan(a, m1, { due: "2026-12-10T10:00:00Z" });
    await addLoan(a, m2, { due: "2026-12-05T10:00:00Z" });
    await addLoan(a, m3, { due: "2026-11-02T10:00:00Z", returned: "2026-11-03T10:00:00Z" }); // returned: not the next due date
    const map = await retrieval().summaries([a, b, gone, NIL, "bad"]);
    expect([...map.keys()].sort()).toEqual([a, b].sort());
    expect(map.get(a)).toMatchObject({
      title: "Sum A",
      publicationYear: 1999,
      coverImageUrl: "https://img.example/a.jpg",
      availableCopies: 1,
      totalCopies: 3,
      nextDueAt: "2026-12-05T10:00:00.000Z",
    });
    expect(map.get(b)).toMatchObject({ publicationYear: null, coverImageUrl: null, nextDueAt: null });
    expect((await retrieval().summaries([])).size).toBe(0);
    expect((await retrieval().summaries(["bad"])).size).toBe(0);
  });

  it("recentLoanTitles: newest first, capped, only that member's; a malformed id is no query", async () => {
    const m = await addMember();
    const other = await addMember();
    const ids = [await addBook("First"), await addBook("Second"), await addBook("Third")];
    await addLoan(ids[0]!, m, { borrowed: "2026-10-01T10:00:00Z", due: "2026-10-20T10:00:00Z" });
    await addLoan(ids[1]!, m, {
      borrowed: "2026-10-05T10:00:00Z",
      due: "2026-10-25T10:00:00Z",
      returned: "2026-10-10T10:00:00Z",
    });
    await addLoan(ids[2]!, m, { borrowed: "2026-10-09T10:00:00Z", due: "2026-10-29T10:00:00Z" });
    await addLoan(ids[0]!, other, { borrowed: "2026-10-12T10:00:00Z", due: "2026-10-30T10:00:00Z" });
    expect(await retrieval().recentLoanTitles(m, 5)).toEqual(["Third", "Second", "First"]);
    expect(await retrieval().recentLoanTitles(m, 2)).toEqual(["Third", "Second"]);
    expect(await retrieval().recentLoanTitles(NIL, 5)).toEqual([]);
    expect(await retrieval().recentLoanTitles("not-a-uuid", 5)).toEqual([]);
  });
});

describe("PgBookStock", () => {
  const stock = () => new PgBookStock(db());

  it("takeCopy takes one copy from an available, live book", async () => {
    const id = await addBook("Stock", { total: 2, available: 2 });
    expect(await stock().takeCopy(id)).toEqual({ kind: "taken" });
    expect((await pool.query("SELECT available_copies FROM books WHERE id = $1", [id])).rows[0].available_copies).toBe(
      1,
    );
  });

  it("takeCopy explains a refusal: unavailable (with the title, and the earliest due date of open loans when there are some), archived or unknown → not_found", async () => {
    const none = await addBook("Shelf Empty", { total: 1, available: 0 });
    expect(await stock().takeCopy(none)).toEqual({ kind: "unavailable", title: "Shelf Empty", nextDueAt: null });
    const lent = await addBook("Lent Out", { total: 2, available: 0 });
    await addLoan(lent, await addMember(), { due: "2026-12-20T10:00:00Z" });
    await addLoan(lent, await addMember(), { due: "2026-12-12T10:00:00Z" });
    await addLoan(lent, await addMember(), { due: "2026-11-05T10:00:00Z", returned: "2026-11-06T10:00:00Z" });
    expect(await stock().takeCopy(lent)).toEqual({
      kind: "unavailable",
      title: "Lent Out",
      nextDueAt: new Date("2026-12-12T10:00:00Z"),
    });
    const archived = await addBook("Archived", { archived: true, total: 1, available: 1 });
    expect(await stock().takeCopy(archived)).toEqual({ kind: "not_found" });
    expect(await stock().takeCopy(NIL)).toEqual({ kind: "not_found" });
  });

  it("returnCopy gives a copy back; for a missing book it throws; the DB check stops a copy count above the total", async () => {
    const id = await addBook("Back", { total: 2, available: 1 });
    await stock().returnCopy(id);
    expect((await pool.query("SELECT available_copies FROM books WHERE id = $1", [id])).rows[0].available_copies).toBe(
      2,
    );
    const over = await stock()
      .returnCopy(id)
      .catch((e: unknown) => e);
    expect(pgError(over)).toEqual({ code: PgCode.checkViolation, constraint: "books_copies_ck" });
    await expect(stock().returnCopy(NIL)).rejects.toThrow(`returnCopy: book ${NIL} not found`);
  });

  it("pgBookStockFor binds the stock statements to a transaction handle", async () => {
    const id = await addBook("Tx", { total: 1, available: 1 });
    await expect(
      db().transaction(async (tx) => {
        expect(await pgBookStockFor(tx).takeCopy(id)).toEqual({ kind: "taken" });
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");
    expect((await pool.query("SELECT available_copies FROM books WHERE id = $1", [id])).rows[0].available_copies).toBe(
      1,
    ); // rolled back with it
  });
});

describe("PgCirculationStore", () => {
  const store = () => new PgCirculationStore(db(), (tx: DbOrTx): BookStock => pgBookStockFor(tx));

  it("lockMember: found, unknown and malformed ids", async () => {
    const m = await addMember("INACTIVE");
    const got = await store().inTransaction(async (tx) => ({
      found: await tx.loans.lockMember(m),
      unknown: await tx.loans.lockMember(NIL),
      bad: await tx.loans.lockMember("nope"),
    }));
    expect(got.found).toEqual({ id: m, fullName: expect.stringMatching(/^Member /), status: "INACTIVE" });
    expect(got.unknown).toBeNull();
    expect(got.bad).toBeNull();
  });

  it("countOpenLoans and findOpenLoan only look at open loans of that member", async () => {
    const m = await addMember();
    const other = await addMember();
    const [a, b, c] = [await addBook("One"), await addBook("Two"), await addBook("Three")];
    await addLoan(a, m, { due: "2026-12-02T10:00:00Z" });
    await addLoan(b, m, { returned: "2026-11-05T10:00:00Z" });
    await addLoan(c, other);
    const r = await store().inTransaction(async (tx) => ({
      open: await tx.loans.countOpenLoans(m),
      none: await tx.loans.countOpenLoans(await addMember()),
      same: await tx.loans.findOpenLoan(m, a),
      returned: await tx.loans.findOpenLoan(m, b),
      notHis: await tx.loans.findOpenLoan(m, c),
      bad: await tx.loans.findOpenLoan(m, "bad-id"),
    }));
    expect(r.open).toBe(1);
    expect(r.none).toBe(0);
    expect(r.same).toMatchObject({ title: "One", dueAt: new Date("2026-12-02T10:00:00Z") });
    expect(r.returned).toBeNull();
    expect(r.notHis).toBeNull();
    expect(r.bad).toBeNull();
  });

  it("close closes an open loan once; returnState then says who returned it; unknown or malformed ids are null", async () => {
    const m = await addMember();
    const b = await addBook("Close Me");
    const loan = await addLoan(b, m);
    const at = new Date("2026-11-20T09:00:00Z");
    const r = await store().inTransaction(async (tx) => ({
      bad: await tx.loans.close("x", staff.librarian, at),
      unknown: await tx.loans.close(NIL, staff.librarian, at),
      first: await tx.loans.close(loan, staff.supervisor, at),
      second: await tx.loans.close(loan, staff.librarian, at),
      state: await tx.loans.returnState(loan),
      stateBad: await tx.loans.returnState("x"),
      stateUnknown: await tx.loans.returnState(NIL),
    }));
    expect(r.bad).toBeNull();
    expect(r.unknown).toBeNull();
    expect(r.first).toEqual({ bookId: b });
    expect(r.second).toBeNull();
    expect(r.state).toEqual({ returnedAt: at, returnedByName: "Samir Supervisor" });
    expect(r.stateBad).toBeNull();
    expect(r.stateUnknown).toBeNull();
  });

  it("returnState of a loan with no returning staff member has no name", async () => {
    const loan = await addLoan(await addBook("Open"), await addMember());
    const state = await store().inTransaction((tx) => tx.loans.returnState(loan));
    expect(state?.returnedByName).toBeNull();
  });

  it("SLM-18 renew: extends an open loan once from its due date; renewalState explains the rest; unknown or malformed ids", async () => {
    const m = await addMember();
    const b = await addBook("Renew Me");
    const loan = await addLoan(b, m, { due: "2026-12-01T10:00:00Z" });
    const at = new Date("2026-11-20T09:00:00Z");
    const r = await store().inTransaction(async (tx) => ({
      bad: await tx.loans.renew("x", staff.librarian, at, 14),
      unknown: await tx.loans.renew(NIL, staff.librarian, at, 14),
      first: await tx.loans.renew(loan, staff.admin, at, 14),
      second: await tx.loans.renew(loan, staff.librarian, at, 14),
      state: await tx.loans.renewalState(loan),
      stateBad: await tx.loans.renewalState("x"),
      stateUnknown: await tx.loans.renewalState(NIL),
    }));
    expect(r).toMatchObject({
      bad: false,
      unknown: false,
      first: true,
      second: false,
      stateBad: null,
      stateUnknown: null,
    });
    expect(r.state).toEqual({
      dueAt: new Date("2026-12-15T10:00:00Z"),
      returnedAt: null,
      returnedByName: null,
      renewedAt: at,
    });
    const row = (await pool.query("SELECT renewed_by FROM loans WHERE id = $1", [loan])).rows[0];
    expect(row.renewed_by).toBe(staff.admin);
  });

  it("insert returns the new loan id", async () => {
    const m = await addMember();
    const b = await addBook("Ins");
    const id = await store().inTransaction((tx) =>
      tx.loans.insert({
        bookId: b,
        memberId: m,
        processedBy: staff.librarian,
        borrowedAt: new Date("2026-11-20T10:00:00Z"),
        dueAt: new Date("2026-12-04T10:00:00Z"),
      }),
    );
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("a duplicate open loan hits the database backstop and comes out as ALREADY_BORROWED (nothing is kept)", async () => {
    const m = await addMember();
    const b = await addBook("Dup");
    await addLoan(b, m);
    const err = await store()
      .inTransaction((tx) =>
        tx.loans.insert({
          bookId: b,
          memberId: m,
          processedBy: staff.librarian,
          borrowedAt: new Date("2026-11-20T10:00:00Z"),
          dueAt: new Date("2026-12-04T10:00:00Z"),
        }),
      )
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ status: 409, code: "ALREADY_BORROWED" });
    expect((await pool.query("SELECT count(*)::int AS n FROM loans")).rows[0].n).toBe(1);
  });

  it("a stock change that breaks the copies check comes out as BOOK_UNAVAILABLE; any other error passes through untouched", async () => {
    const b = await addBook("Check", { total: 1, available: 1 });
    const unavailable = await store()
      .inTransaction((tx) => tx.stock.returnCopy(b))
      .catch((e: unknown) => e); // 2 of 1 copies
    expect(unavailable).toMatchObject({ status: 409, code: "BOOK_UNAVAILABLE" });
    const plain = new Error("plain failure");
    expect(
      await store()
        .inTransaction(async () => {
          throw plain;
        })
        .catch((e: unknown) => e),
    ).toBe(plain);
    const fk = await store()
      .inTransaction((tx) =>
        tx.loans.insert({
          bookId: NIL,
          memberId: NIL,
          processedBy: staff.librarian,
          borrowedAt: new Date(),
          dueAt: new Date(Date.now() + 1e9),
        }),
      )
      .catch((e: unknown) => e);
    expect(fk).not.toBeInstanceOf(AppError); // a foreign-key violation is not mapped to a domain error
  });

  it("the unit of work is atomic: a loan and its stock change commit or roll back together", async () => {
    const m = await addMember();
    const b = await addBook("Atomic", { total: 1, available: 1 });
    await expect(
      store().inTransaction(async (tx) => {
        expect(await tx.stock.takeCopy(b)).toEqual({ kind: "taken" });
        await tx.loans.insert({
          bookId: b,
          memberId: m,
          processedBy: staff.librarian,
          borrowedAt: new Date("2026-11-20T10:00:00Z"),
          dueAt: new Date("2026-12-04T10:00:00Z"),
        });
        throw new Error("rollback please");
      }),
    ).rejects.toThrow("rollback please");
    expect((await pool.query("SELECT available_copies FROM books WHERE id = $1", [b])).rows[0].available_copies).toBe(
      1,
    );
    expect((await pool.query("SELECT count(*)::int AS n FROM loans")).rows[0].n).toBe(0);
  });
});
