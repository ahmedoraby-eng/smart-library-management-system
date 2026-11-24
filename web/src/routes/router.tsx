import { BookListQuerySchema, type BookDto, type Me, type Page } from "@slm/contracts";
import { useQuery } from "@tanstack/react-query";
import { createRootRoute, createRoute, createRouter, Link, Outlet } from "@tanstack/react-router";
import { api, toQuery } from "../lib/apiClient";

/**
 * Walking-skeleton routes only. Haya's SL-07 replaces the screens (ux.md).
 * The pattern to keep: list filters, sort and paging live in the URL as typed search params,
 * validated by the same zod schema the API uses (contracts/).
 */
const rootRoute = createRootRoute({
  component: function Root() {
    const me = useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/me"), retry: false });
    return (
      <div className="mx-auto max-w-3xl p-8 font-sans">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Smart Library</h1>
          <nav className="flex gap-4 text-sm">
            <Link to="/">Home</Link>
            <Link to="/books" search={{ page: 1, size: 20 }}>Books</Link>
          </nav>
        </header>
        <p className="mt-2 text-sm text-slate-600" data-testid="whoami">
          {me.data ? `Signed in as ${me.data.fullName} (${me.data.role})` : me.isError ? "Not signed in" : "Loading…"}
        </p>
        <main className="mt-6"><Outlet /></main>
      </div>
    );
  },
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => <p className="text-slate-700">Staff operations: catalog, members, Borrow Book and Return Book.</p>,
});

const booksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/books",
  validateSearch: BookListQuerySchema,
  component: function Books() {
    const search = booksRoute.useSearch();
    const books = useQuery({
      queryKey: ["books", search],
      queryFn: () => api<Page<BookDto>>(`/books${toQuery(search)}`),
    });
    return (
      <section>
        <p className="text-sm text-slate-500">Search params (typed): {JSON.stringify(search)}</p>
        {books.isError && <p className="mt-2 text-sm text-amber-700">Book list arrives with SL-01.</p>}
        <ul className="mt-2">{books.data?.items.map((b) => <li key={b.id}>{b.title}</li>)}</ul>
      </section>
    );
  },
});

export const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute, booksRoute]) });

declare module "@tanstack/react-router" {
  interface Register { router: typeof router }
}
