import type { BookInput, BookListQuery, BookSortKey } from "@slm/contracts";
import { BOOK_SORT_KEYS } from "@slm/contracts";
import { ConflictError, NotFoundError } from "../../platform/errors";
import { parseSort } from "../../platform/http";
import { deletionOutcome, totalBelowLoaned, type BookRepository, type BookView } from "../domain/Book";

const duplicateIsbn = (other: { id: string; title: string }) =>
  new ConflictError("DUPLICATE_ISBN", "Duplicate ISBN", `Another book already uses this ISBN: '${other.title}'.`, {
    bookId: other.id,
    title: other.title,
  });

/** Catalogue use cases (SLM-1). Authorization is checked by the route guard before these run. */
export class BookService {
  constructor(private readonly books: BookRepository) {}

  async get(id: string): Promise<BookView> {
    const book = await this.books.findView(id);
    if (!book) throw new NotFoundError("This book");
    return book;
  }

  async list(query: BookListQuery) {
    const sort = parseSort<BookSortKey>(query.sort, BOOK_SORT_KEYS, [{ key: "title", desc: false }]);
    const { items, total } = await this.books.list({
      ...(query.q ? { q: query.q } : {}),
      ...(query.category ? { category: query.category } : {}),
      availability: query.availability ?? "all",
      sort,
      page: query.page,
      size: query.size,
    });
    return { items, total, page: query.page, size: query.size };
  }

  categories(): Promise<string[]> {
    return this.books.categories();
  }

  async create(input: BookInput): Promise<BookView> {
    const r = await this.books.create(input);
    if (r.kind === "duplicate_isbn") throw duplicateIsbn(r.other);
    return r.book;
  }

  async update(id: string, version: number, input: BookInput): Promise<BookView> {
    const r = await this.books.update(id, version, input);
    switch (r.kind) {
      case "ok":
        return r.book;
      case "not_found":
        throw new NotFoundError("This book");
      case "stale":
        throw new ConflictError(
          "STALE_VERSION",
          "Changed by someone else",
          "Someone else changed this book while you were editing. Reload to see their version.",
        );
      case "below_loaned":
        throw totalBelowLoaned(r.onLoan);
      case "duplicate_isbn":
        throw duplicateIsbn(r.other);
    }
  }

  async remove(id: string): Promise<"archived" | "deleted"> {
    const outcome = await this.books.removeWith(id, deletionOutcome);
    if (!outcome) throw new NotFoundError("This book");
    return outcome === "archive" ? "archived" : "deleted";
  }
}
