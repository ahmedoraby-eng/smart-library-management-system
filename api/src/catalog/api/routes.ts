import {
  BookInputSchema,
  BookListQuerySchema,
  BookUpdateSchema,
  IsbnLookupQuerySchema,
  normalizeIsbn,
  type BookDto,
} from "@slm/contracts";
import { Hono } from "hono";
import type { AppEnv } from "../../platform/appEnv";
import { parseOr400 } from "../../platform/http";
import { requirePermission } from "../../platform/security/requirePermission";
import type { BookView } from "../domain/Book";

export function toBookDto(b: BookView): BookDto {
  return {
    id: b.id,
    title: b.title,
    author: b.author,
    isbn: b.isbn,
    description: b.description,
    category: b.category,
    publisher: b.publisher,
    publicationYear: b.publicationYear,
    coverImageUrl: b.coverImageUrl,
    totalCopies: b.totalCopies,
    availableCopies: b.availableCopies,
    activeLoans: b.activeLoans,
    nextDueAt: b.nextDueAt?.toISOString() ?? null,
    hasLoanHistory: b.hasLoanHistory,
    archived: b.archivedAt !== null,
    version: b.version,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

const body = async (c: { req: { json: () => Promise<unknown> } }) => c.req.json().catch(() => null);

/** /api/books (SLM-1 catalog, SLM-2 search). Permissions per rbac-matrix.md. */
export function bookRoutes() {
  const r = new Hono<AppEnv>();

  r.get("/", requirePermission("BOOK_READ"), async (c) => {
    const query = parseOr400(BookListQuerySchema, c.req.query());
    const page = await c.var.container.books.list(query);
    return c.json({ ...page, items: page.items.map(toBookDto) });
  });

  r.get("/categories", requirePermission("BOOK_READ"), async (c) =>
    c.json({ items: await c.var.container.books.categories() }),
  );

  // SLM-13: registered before /:id so "isbn-lookup" isn't read as an id. Always 200 for a valid ISBN.
  r.get("/isbn-lookup", requirePermission("BOOK_WRITE"), async (c) => {
    const { isbn } = parseOr400(IsbnLookupQuerySchema, c.req.query());
    return c.json(await c.var.container.isbnLookup.lookup(normalizeIsbn(isbn)!));
  });

  r.get("/:id", requirePermission("BOOK_READ"), async (c) =>
    c.json(toBookDto(await c.var.container.books.get(c.req.param("id")))),
  );

  r.post("/", requirePermission("BOOK_WRITE"), async (c) => {
    const input = parseOr400(BookInputSchema, await body(c));
    const book = await c.var.container.books.create(input);
    await c.var.container.bookIndex.syncBookSafely(book.id); // SLM-16: chunk + embed for discovery; never fails the save
    c.header("location", `/api/books/${book.id}`);
    return c.json(toBookDto(book), 201);
  });

  r.put("/:id", requirePermission("BOOK_WRITE"), async (c) => {
    const { version, ...input } = parseOr400(BookUpdateSchema, await body(c));
    const book = await c.var.container.books.update(c.req.param("id"), version, input);
    await c.var.container.bookIndex.syncBookSafely(book.id); // re-embeds only if the catalogue text changed
    return c.json(toBookDto(book));
  });

  r.delete("/:id", requirePermission("BOOK_DELETE"), async (c) => {
    const result = await c.var.container.books.remove(c.req.param("id"));
    await c.var.container.bookIndex.syncBookSafely(c.req.param("id")); // archived → its chunks go
    return c.json({ result });
  });

  return r;
}
