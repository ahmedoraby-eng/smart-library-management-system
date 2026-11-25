// @vitest-environment jsdom
import { BookListQuerySchema, ROLE_PERMISSIONS, type BookDto, type Me } from "@slm/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/ui";
import { BooksPage } from "./BooksPage";

/** SLM-2 AC4 (count), AC5 (empty result + Clear filters), AC6b (state lives in the URL). */
const librarian: Me = {
  id: "s1",
  email: "s@x.org",
  fullName: "Staff",
  role: "LIBRARIAN",
  permissions: [...ROLE_PERMISSIONS.LIBRARIAN],
  isDemo: false,
};
const book = (title: string): BookDto => ({
  id: `id-${title}`,
  title,
  author: "A. Author",
  isbn: null,
  description: "",
  category: "Fiction",
  publisher: "",
  publicationYear: 2001,
  coverImageUrl: null,
  totalCopies: 2,
  availableCopies: 1,
  activeLoans: 1,
  nextDueAt: null,
  hasLoanHistory: true,
  archived: false,
  version: 0,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
});
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

function stubApi(results: (url: URL) => BookDto[]) {
  const calls: URL[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/me") return json(librarian);
      if (url.pathname === "/api/books/categories") return json({ items: ["Fiction", "Programming"] });
      if (url.pathname === "/api/books") {
        calls.push(url);
        const items = results(url);
        return json({ items, page: Number(url.searchParams.get("page") ?? 1), size: 20, total: items.length });
      }
      return new Response("{}", { status: 404 });
    }),
  );
  return calls;
}

async function visit(path: string) {
  const root = createRootRoute({ component: Outlet });
  const app = createRoute({ getParentRoute: () => root, id: "app", component: Outlet });
  const books = createRoute({
    getParentRoute: () => app,
    path: "/books",
    validateSearch: BookListQuerySchema,
    component: BooksPage,
  });
  const detail = createRoute({ getParentRoute: () => app, path: "/books/$bookId", component: () => <p>detail</p> });
  const router = createRouter({
    routeTree: root.addChildren([app.addChildren([books, detail])]),
    history: createMemoryHistory({ initialEntries: [path] }),
    parseSearch: (search) => Object.fromEntries(new URLSearchParams(search)),
  });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  await router.load();
  return router;
}

afterEach(() => vi.unstubAllGlobals());

describe("SLM-2 Books page", () => {
  it("AC4 shows how many books match the query", async () => {
    stubApi(() => [book("Clean Code"), book("Clean Architecture")]);
    await visit("/books?q=clean");
    await waitFor(() => expect(screen.getByTestId("result-line")).toHaveTextContent("2 books match “clean”"));
    expect(screen.getAllByTestId("book-title")).toHaveLength(2);
  });

  it("AC6b filters, sort and page come from the URL and go to the API unchanged", async () => {
    const calls = stubApi(() => [book("Dune")]);
    await visit("/books?q=dune&category=Fiction&availability=available&sort=-title&page=1");
    await screen.findByTestId("result-line");
    const last = calls.at(-1)!;
    expect(last.searchParams.get("q")).toBe("dune");
    expect(last.searchParams.get("category")).toBe("Fiction");
    expect(last.searchParams.get("availability")).toBe("available");
    expect(last.searchParams.get("sort")).toBe("-title");
  });

  it("AC5 no match → empty state with Clear filters, which clears q and filters from the URL", async () => {
    stubApi((url) => (url.searchParams.get("q") ? [] : [book("Dune")]));
    const router = await visit("/books?q=zzz&category=Fiction");
    expect(await screen.findByTestId("books-empty-filtered")).toHaveTextContent("No books match “zzz”");
    await userEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]!);
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty("q"));
    expect(router.state.location.search).not.toHaveProperty("category");
    await waitFor(() => expect(screen.getByTestId("result-line")).toHaveTextContent("1 book"));
  });
});
