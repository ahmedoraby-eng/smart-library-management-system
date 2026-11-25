import { describe, expect, it } from "vitest";
import {
  BOOK_SORT_KEYS,
  BookDeleteResultSchema,
  BookInputSchema,
  BookListQuerySchema,
  BookUpdateSchema,
  CategoriesSchema,
  IsbnLookupQuerySchema,
  IsbnLookupResultSchema,
  normalizeIsbn,
} from "./books";

const valid = { title: "Dune", author: "Frank Herbert", category: "Science Fiction", totalCopies: 2 };
const issues = (input: unknown) => {
  const r = BookInputSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
};

describe("normalizeIsbn", () => {
  it("accepts ISBN-10 (with hyphens, spaces, lowercase x check digit) and ISBN-13, returning the bare digits", () => {
    expect(normalizeIsbn("0-306-40615-2")).toBe("0306406152");
    expect(normalizeIsbn(" 0 306 40615 2 ")).toBe("0306406152");
    expect(normalizeIsbn("080442957x")).toBe("080442957X");
    expect(normalizeIsbn("978-0-306-40615-7")).toBe("9780306406157");
  });
  it("rejects a bad check digit, wrong length and non-digits", () => {
    expect(normalizeIsbn("0306406153")).toBeNull();
    expect(normalizeIsbn("9780306406158")).toBeNull();
    expect(normalizeIsbn("12345")).toBeNull();
    expect(normalizeIsbn("")).toBeNull();
    expect(normalizeIsbn("abcdefghij")).toBeNull();
    expect(normalizeIsbn("97803064061X7")).toBeNull();
  });
});

describe("BookInputSchema", () => {
  it("normalises a minimal valid book: optional text becomes '', optional numbers/urls become null", () => {
    expect(BookInputSchema.parse(valid)).toEqual({
      ...valid,
      isbn: null,
      publisher: "",
      publicationYear: null,
      coverImageUrl: null,
      description: "",
    });
  });

  it("trims text, normalises the ISBN and keeps an https cover URL", () => {
    const out = BookInputSchema.parse({
      ...valid,
      title: "  Dune  ",
      isbn: " 978-0-306-40615-7 ",
      publisher: " Ace ",
      publicationYear: 1965,
      coverImageUrl: " https://img.example/c.jpg ",
      description: " Spice. ",
    });
    expect(out).toMatchObject({
      title: "Dune",
      isbn: "9780306406157",
      publisher: "Ace",
      publicationYear: 1965,
      coverImageUrl: "https://img.example/c.jpg",
      description: "Spice.",
    });
  });

  it("empty or null ISBN and cover become null", () => {
    expect(BookInputSchema.parse({ ...valid, isbn: "", coverImageUrl: "" })).toMatchObject({
      isbn: null,
      coverImageUrl: null,
    });
    expect(BookInputSchema.parse({ ...valid, isbn: null, coverImageUrl: null })).toMatchObject({
      isbn: null,
      coverImageUrl: null,
    });
  });

  it("required fields report the form messages (missing, blank and over-long)", () => {
    expect(issues({})).toEqual(
      expect.arrayContaining([
        { path: "title", message: "Enter a title." },
        { path: "author", message: "Enter an author." },
        { path: "category", message: "Choose or type a category." },
        { path: "totalCopies", message: "Enter at least 1 copy." },
      ]),
    );
    expect(issues({ ...valid, title: "   ", author: "", category: " " })).toEqual(
      expect.arrayContaining([
        { path: "title", message: "Enter a title." },
        { path: "author", message: "Enter an author." },
        { path: "category", message: "Choose or type a category." },
      ]),
    );
    expect(issues({ ...valid, title: "x".repeat(201), author: "x".repeat(201), category: "x".repeat(61) })).toEqual([
      { path: "title", message: "Keep the title under 200 characters." },
      { path: "author", message: "Keep the author under 200 characters." },
      { path: "category", message: "Keep the category under 60 characters." },
    ]);
    expect(issues({ ...valid, publisher: "x".repeat(121), description: "x".repeat(2001) })).toEqual([
      { path: "publisher", message: "Keep the publisher under 120 characters." },
      { path: "description", message: "Keep the description under 2,000 characters." },
    ]);
  });

  it("an invalid ISBN is a field error", () => {
    expect(issues({ ...valid, isbn: "123" })).toEqual([{ path: "isbn", message: "Enter a valid ISBN-10 or ISBN-13." }]);
  });

  it("publicationYear: between 1450 and this year, whole number, number type", () => {
    const year = new Date().getUTCFullYear();
    const msg = `Enter a year between 1450 and ${year}.`;
    expect(BookInputSchema.parse({ ...valid, publicationYear: 1450 }).publicationYear).toBe(1450);
    expect(BookInputSchema.parse({ ...valid, publicationYear: year }).publicationYear).toBe(year);
    expect(BookInputSchema.parse({ ...valid, publicationYear: null }).publicationYear).toBeNull();
    for (const bad of [1449, year + 1, 1999.5, "1999"]) {
      expect(issues({ ...valid, publicationYear: bad }).map((i) => i.message)).toContain(msg);
    }
  });

  it("coverImageUrl must be https and under 1000 characters", () => {
    expect(issues({ ...valid, coverImageUrl: "http://img.example/c.jpg" })).toEqual([
      { path: "coverImageUrl", message: "Enter a full image URL starting with https://." },
    ]);
    expect(issues({ ...valid, coverImageUrl: "https://has space.example/c.jpg" })).toHaveLength(1);
    expect(issues({ ...valid, coverImageUrl: "https://x.example/" + "a".repeat(1000) })).toHaveLength(1);
  });

  it("totalCopies: whole number, at least 1, at most 10,000", () => {
    expect(issues({ ...valid, totalCopies: 0 })).toEqual([{ path: "totalCopies", message: "Enter at least 1 copy." }]);
    expect(issues({ ...valid, totalCopies: 1.5 })).toEqual([{ path: "totalCopies", message: "Enter a whole number." }]);
    expect(issues({ ...valid, totalCopies: 10_001 })).toHaveLength(1);
    expect(BookInputSchema.parse({ ...valid, totalCopies: 10_000 }).totalCopies).toBe(10_000);
    expect(issues({ ...valid, totalCopies: "2" })).toEqual([
      { path: "totalCopies", message: "Enter at least 1 copy." },
    ]);
  });
});

describe("BookUpdateSchema", () => {
  it("adds a non-negative integer version", () => {
    expect(BookUpdateSchema.parse({ ...valid, version: 0 }).version).toBe(0);
    expect(BookUpdateSchema.safeParse({ ...valid, version: -1 }).success).toBe(false);
    expect(BookUpdateSchema.safeParse({ ...valid, version: 1.5 }).success).toBe(false);
    expect(BookUpdateSchema.safeParse(valid).success).toBe(false);
  });
});

describe("list, delete, categories and lookup contracts", () => {
  it("BookListQuerySchema: defaults, trimming, availability enum and limits", () => {
    expect(BookListQuerySchema.parse({})).toEqual({ page: 1, size: 20 });
    expect(
      BookListQuerySchema.parse({
        q: "  dune ",
        category: " SF ",
        availability: "available",
        sort: "-createdAt",
        page: "2",
        size: "5",
      }),
    ).toEqual({ q: "dune", category: "SF", availability: "available", sort: "-createdAt", page: 2, size: 5 });
    expect(BookListQuerySchema.safeParse({ availability: "some" }).success).toBe(false);
    expect(BookListQuerySchema.safeParse({ q: "x".repeat(201) }).success).toBe(false);
    expect(BookListQuerySchema.safeParse({ category: "x".repeat(61) }).success).toBe(false);
    expect(BookListQuerySchema.safeParse({ sort: "x".repeat(81) }).success).toBe(false);
    expect(BOOK_SORT_KEYS).toContain("availableCopies");
  });

  it("BookDeleteResultSchema and CategoriesSchema", () => {
    expect(BookDeleteResultSchema.parse({ result: "archived" })).toEqual({ result: "archived" });
    expect(BookDeleteResultSchema.safeParse({ result: "gone" }).success).toBe(false);
    expect(CategoriesSchema.parse({ items: ["A", "B"] }).items).toEqual(["A", "B"]);
    expect(CategoriesSchema.safeParse({ items: [1] }).success).toBe(false);
  });

  it("IsbnLookupQuerySchema trims and validates the ISBN, with the same message for a missing one", () => {
    expect(IsbnLookupQuerySchema.parse({ isbn: " 978-0-306-40615-7 " }).isbn).toBe("978-0-306-40615-7");
    for (const bad of [{ isbn: "123" }, {}]) {
      const r = IsbnLookupQuerySchema.safeParse(bad);
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0]!.message).toBe("Enter a valid ISBN-10 or ISBN-13.");
    }
  });

  it("IsbnLookupResultSchema is a union on `found`: a book, or one of three reasons", () => {
    const book = {
      title: "Dune",
      author: null,
      publisher: null,
      publicationYear: 1965,
      description: null,
      coverImageUrl: null,
    };
    expect(IsbnLookupResultSchema.parse({ found: true, book })).toEqual({ found: true, book });
    for (const reason of ["not_found", "timeout", "unavailable"])
      expect(IsbnLookupResultSchema.parse({ found: false, reason })).toEqual({ found: false, reason });
    expect(IsbnLookupResultSchema.safeParse({ found: false, reason: "other" }).success).toBe(false);
    expect(IsbnLookupResultSchema.safeParse({ found: true }).success).toBe(false);
    expect(IsbnLookupResultSchema.safeParse({ found: true, book: { ...book, publicationYear: 1.5 } }).success).toBe(
      false,
    );
  });
});
