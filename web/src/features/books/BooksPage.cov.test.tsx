// @vitest-environment jsdom
import type { BookDto, Me } from "@slm/contracts";
import { ROLE_PERMISSIONS } from "@slm/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderApp } from "../circulation/testApp";

afterEach(() => vi.unstubAllGlobals());

const me = (role: "ADMIN" | "LIBRARIAN" | "SUPERVISOR"): Me => ({
  id: "u1",
  email: "u@library.test",
  fullName: "Test User",
  role,
  permissions: [...ROLE_PERMISSIONS[role]],
  isDemo: false,
});
const book = (id: string, patch: Partial<BookDto> = {}): BookDto => ({
  id,
  title: `Title ${id}`,
  author: `Author ${id}`,
  isbn: "9780134757599",
  description: "",
  category: "Software",
  publisher: "",
  publicationYear: 2018,
  coverImageUrl: null,
  totalCopies: 3,
  availableCopies: 2,
  activeLoans: 1,
  nextDueAt: null,
  hasLoanHistory: false,
  archived: false,
  version: 0,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  ...patch,
});
const problem = (status: number, code: string) => ({
  status,
  body: { type: "about:blank", title: code, status, code },
});

type Req = Parameters<Parameters<typeof renderApp>[1]>[0];
/** Records the /api/books list URLs; `list` decides the answer. */
function visit(
  path: string,
  list: (url: URL) => BookDto[] | { status: number; body: unknown },
  who: Me = me("LIBRARIAN"),
  extra?: (r: Req) => { status?: number; body: unknown } | undefined,
  total = 45,
) {
  const urls: URL[] = [];
  const app = renderApp(
    path,
    (r) => {
      if (r.url.pathname === "/api/books/categories") return { body: { items: ["Fiction", "Software"] } };
      if (r.url.pathname === "/api/books" && r.method === "GET") {
        urls.push(r.url);
        const res = list(r.url);
        if (Array.isArray(res))
          return {
            body: {
              items: res,
              page: Number(r.url.searchParams.get("page") ?? 1),
              size: 20,
              total: res.length === 0 ? 0 : total,
            },
          };
        return res;
      }
      return extra?.(r);
    },
    who,
  );
  return { urls, app };
}

describe("Books page rows and navigation", () => {
  it("lists books with cover, author, category, year, isbn and availability", async () => {
    const { app } = visit("/books", () => [
      book("1", { coverImageUrl: "https://img.test/1.jpg" }),
      book("2", { publicationYear: null, isbn: null, availableCopies: 0, nextDueAt: "2026-12-24T10:00:00.000Z" }),
    ]);
    await app;
    const rows = await screen.findAllByTestId("book-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("Author 1")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("9780134757599")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("2018")).toBeInTheDocument();
    expect(within(rows[0]!).getByTestId("book-cover").querySelector("img")).toHaveAttribute(
      "src",
      "https://img.test/1.jpg",
    );
    expect(within(rows[1]!).getAllByText("—")).toHaveLength(2); // year and ISBN
    expect(within(rows[1]!).getByTestId("availability")).toHaveTextContent("0 of 3 available");
    expect(within(rows[1]!).getByTestId("next-due")).toHaveTextContent("Next copy due back");
    expect(screen.getByTestId("pagination-summary")).toHaveTextContent("Showing 1–20 of 45");
  });

  it("clicking a row opens the book; clicking its title link does not navigate twice", async () => {
    const user = userEvent.setup();
    const { app } = visit("/books", () => [book("1"), book("2")]);
    const { router } = await app;
    const rows = await screen.findAllByTestId("book-row");
    await user.click(within(rows[1]!).getByText("Author 2"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/books/2"));
    await router.navigate({ to: "/books", search: { page: 1, size: 20 } });
    const again = await screen.findAllByTestId("book-row");
    await user.click(within(again[0]!).getByTestId("book-title"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/books/1"));
  });

  it("a librarian sees Add book, Borrow on available rows only, and Edit (no Delete) in the row menu", async () => {
    const user = userEvent.setup();
    const { app } = visit("/books", () => [book("1"), book("2", { availableCopies: 0 })]);
    const { router } = await app;
    expect(await screen.findByTestId("add-book")).toHaveAttribute("href", "/books/new");
    const rows = await screen.findAllByTestId("book-row");
    expect(within(rows[0]!).getByTestId("row-borrow")).toBeInTheDocument();
    expect(within(rows[1]!).queryByTestId("row-borrow")).not.toBeInTheDocument();
    await user.click(within(rows[0]!).getByTestId("row-actions"));
    expect(screen.queryByTestId("menu-delete")).not.toBeInTheDocument();
    await user.click(await screen.findByTestId("menu-edit"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/books/1/edit"));
  });

  it("an admin can delete from the row menu, and cancelling the dialog keeps the book", async () => {
    const user = userEvent.setup();
    const { app } = visit("/books", () => [book("1", { activeLoans: 0, availableCopies: 3 })], me("ADMIN"));
    await app;
    await user.click(await screen.findByTestId("row-actions"));
    await user.click(await screen.findByTestId("menu-delete"));
    expect(await screen.findByTestId("delete-dialog-delete")).toHaveTextContent("Title 1");
    await user.click(screen.getByTestId("dialog-cancel"));
    await waitFor(() => expect(screen.queryByTestId("delete-dialog-delete")).not.toBeInTheDocument());
    expect(screen.getAllByTestId("book-row")).toHaveLength(1);
  });

  it("confirming Delete sends DELETE for that book and closes the dialog", async () => {
    const user = userEvent.setup();
    const { app } = visit(
      "/books",
      () => [book("1", { activeLoans: 0, availableCopies: 3 })],
      me("ADMIN"),
      ({ method, url }) =>
        method === "DELETE" && url.pathname === "/api/books/1" ? { body: { result: "deleted" } } : undefined,
    );
    const { fetchMock } = await app;
    await user.click(await screen.findByTestId("row-actions"));
    await user.click(await screen.findByTestId("menu-delete"));
    await user.click(await screen.findByTestId("dialog-confirm"));
    await waitFor(() => expect(screen.queryByTestId("delete-dialog-delete")).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/books/1", expect.objectContaining({ method: "DELETE" }));
  });

  it("a supervisor is read-only: no Add book, no Borrow, no row menu", async () => {
    const { app } = visit("/books", () => [book("1")], me("SUPERVISOR"));
    await app;
    await screen.findByTestId("book-row");
    expect(screen.queryByTestId("add-book")).not.toBeInTheDocument();
    expect(screen.queryByTestId("row-borrow")).not.toBeInTheDocument();
    expect(screen.queryByTestId("row-actions")).not.toBeInTheDocument();
  });
});

describe("Books page filters, sort and paging (state lives in the URL)", () => {
  it("search is debounced, trimmed, pushed to the URL and resets to page 1", async () => {
    const user = userEvent.setup();
    const { app, urls } = visit("/books?page=2", () => [book("1")]);
    const { router } = await app;
    await screen.findByTestId("book-row");
    await user.type(screen.getByTestId("book-search"), "  dune ");
    expect(router.state.location.search).not.toHaveProperty("q"); // not yet: debounce
    await waitFor(() => expect(router.state.location.search).toMatchObject({ q: "dune", page: "1" }), {
      timeout: 2000,
    });
    await waitFor(() => expect(urls.at(-1)!.searchParams.get("q")).toBe("dune"));
  });

  it("emptying the search box removes q from the URL", async () => {
    const user = userEvent.setup();
    const { app } = visit("/books?q=dune", () => [book("1")]);
    const { router } = await app;
    const box = (await screen.findByTestId("book-search")) as HTMLInputElement;
    expect(box.value).toBe("dune");
    await user.clear(box);
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty("q"), { timeout: 2000 });
  });

  it("category, availability and sort selects update the URL and the API call", async () => {
    const user = userEvent.setup();
    const { app, urls } = visit("/books", () => [book("1")]);
    const { router } = await app;
    await screen.findByTestId("book-row");
    await user.selectOptions(screen.getByTestId("filter-category"), "Fiction");
    await waitFor(() => expect(urls.at(-1)!.searchParams.get("category")).toBe("Fiction"));
    await user.selectOptions(screen.getByTestId("filter-availability"), "unavailable");
    await waitFor(() => expect(urls.at(-1)!.searchParams.get("availability")).toBe("unavailable"));
    await user.selectOptions(screen.getByTestId("sort-select"), "-availableCopies");
    await waitFor(() => expect(urls.at(-1)!.searchParams.get("sort")).toBe("-availableCopies"));
    expect(router.state.location.search).toMatchObject({
      category: "Fiction",
      availability: "unavailable",
      sort: "-availableCopies",
    });
    // back to "All": the params leave the URL
    await user.selectOptions(screen.getByTestId("filter-availability"), "all");
    await user.selectOptions(screen.getByTestId("filter-category"), "");
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty("category"));
    expect(router.state.location.search.availability).toBeUndefined();
  });

  it("keeps a category from the URL that isn't in the list, and labels an unknown sort", async () => {
    const { app } = visit("/books?category=Poetry&sort=-publisher", () => [book("1")]);
    await app;
    await screen.findByTestId("book-row");
    expect(within(screen.getByTestId("filter-category")).getByRole("option", { name: "Poetry" })).toBeInTheDocument();
    expect(within(screen.getByTestId("sort-select")).getByRole("option", { name: "Custom sort" })).toBeInTheDocument();
  });

  it("column headers sort: Book ascending, again → descending; paging moves to the next page", async () => {
    const user = userEvent.setup();
    const { app, urls } = visit("/books", () => [book("1")]);
    const { router } = await app;
    await screen.findByTestId("book-row");
    await user.click(screen.getByTestId("sort-publicationYear"));
    await waitFor(() => expect(urls.at(-1)!.searchParams.get("sort")).toBe("publicationYear"));
    await user.click(screen.getByTestId("sort-publicationYear"));
    await waitFor(() => expect(urls.at(-1)!.searchParams.get("sort")).toBe("-publicationYear"));
    await user.click(screen.getByTestId("sort-availableCopies"));
    await waitFor(() => expect(urls.at(-1)!.searchParams.get("sort")).toBe("availableCopies"));
    await user.click(await screen.findByTestId("page-next"));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ page: "2", sort: "availableCopies" }));
  });

  it("Clear filters next to the count resets q, category and availability", async () => {
    const user = userEvent.setup();
    const { app } = visit("/books?q=soft&category=Software&availability=available", () => [book("1")]);
    const { router } = await app;
    await user.click(await screen.findByTestId("clear-filters"));
    await waitFor(() => expect(router.state.location.search.q).toBeUndefined());
    expect(router.state.location.search.category).toBeUndefined();
    expect(router.state.location.search.availability).toBeUndefined();
    expect((screen.getByTestId("book-search") as HTMLInputElement).value).toBe("");
    expect(screen.queryByTestId("clear-filters")).not.toBeInTheDocument();
  });

  it("an out-of-URL change to q (back button) wins over the box", async () => {
    const { app } = visit("/books?q=one", () => [book("1")]);
    const { router } = await app;
    const box = (await screen.findByTestId("book-search")) as HTMLInputElement;
    await router.navigate({ to: "/books", search: { q: "two", page: 1, size: 20 } });
    await waitFor(() => expect(box.value).toBe("two"));
  });
});

describe("Books page states", () => {
  it("no books at all: librarians are invited to add the first one", async () => {
    const { app } = visit("/books", () => []);
    await app;
    expect(await screen.findByTestId("books-empty")).toHaveTextContent("Add your first book to start lending.");
    expect(within(screen.getByTestId("books-empty")).getByRole("link", { name: "Add book" })).toHaveAttribute(
      "href",
      "/books/new",
    );
  });

  it("no books at all: a supervisor gets read-only wording and no Add button", async () => {
    const { app } = visit("/books", () => [], me("SUPERVISOR"));
    await app;
    expect(await screen.findByTestId("books-empty")).toHaveTextContent(
      "Books added by the library team will show here.",
    );
    expect(within(screen.getByTestId("books-empty")).queryByRole("link")).not.toBeInTheDocument();
  });

  it("filters without a text query: 'No books match these filters'", async () => {
    const { app } = visit("/books?category=Fiction", () => []);
    await app;
    expect(await screen.findByTestId("books-empty-filtered")).toHaveTextContent("No books match these filters");
  });

  it("a 400 from the API explains the filters aren't valid; Try again asks again", async () => {
    const user = userEvent.setup();
    let calls = 0;
    const { app } = visit("/books?sort=nope", () => (++calls === 1 ? problem(400, "VALIDATION_FAILED") : [book("1")]));
    await app;
    expect(await screen.findByTestId("books-error")).toHaveTextContent(
      "These filters aren't valid. Clear them and try again.",
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("book-row")).toBeInTheDocument();
    expect(screen.queryByTestId("books-error")).not.toBeInTheDocument();
  });

  it("any other failure shows the connection message", async () => {
    const { app } = visit("/books", () => problem(500, "INTERNAL"));
    await app;
    expect(await screen.findByTestId("books-error")).toHaveTextContent(
      "Couldn't load books. Check your connection and try again.",
    );
  });

  it("the result line is singular for one book", async () => {
    const { app } = visit("/books", () => [book("1")], me("LIBRARIAN"), undefined, 1);
    await app;
    await waitFor(() => expect(screen.getByTestId("result-line")).toHaveTextContent("1 book"));
    expect(screen.getByTestId("result-line")).not.toHaveTextContent("1 books");
  });
});
