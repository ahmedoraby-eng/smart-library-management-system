import { BookListQuerySchema } from "@slm/contracts";
import { createRootRoute, createRoute, createRouter, Navigate, Outlet, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { AppLayout } from "../app/AppLayout";
import { ComingSoonPage, DashboardPage, ForbiddenPage, NotFoundPage } from "../app/pages";
import { SignInPage } from "../features/auth/SignInPage";
import { meQueryKey } from "../features/auth/session";
import { BookDetailPage } from "../features/books/BookDetailPage";
import { BookEditPage, BookNewPage } from "../features/books/BookFormPages";
import { BooksPage } from "../features/books/BooksPage";
import { BorrowPage } from "../features/circulation/BorrowPage";
import { CirculationLayout } from "../features/circulation/CirculationLayout";
import { LoanHistoryPage } from "../features/circulation/LoanHistoryPage";
import { ReturnPage } from "../features/circulation/ReturnPage";
import { BorrowSearchSchema, LoanHistorySearchSchema, ReturnSearchSchema } from "../features/circulation/searchSchemas";
import { ApiError } from "../lib/apiClient";
import { queryClient, setApiErrorHandler } from "../lib/queryClient";

/**
 * Code-based routes. Pages never import this file (they use getRouteApi with the route id),
 * so there is no import cycle. List filters, sort and paging live in the URL as typed search
 * params, validated by the same zod schema the API uses (contracts/).
 */
const rootRoute = createRootRoute({
  component: Outlet,
  notFoundComponent: () => <Navigate to="/404" replace />,
});

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/signin",
  validateSearch: z.object({ next: z.string().optional(), error: z.string().optional(), expired: z.string().optional() }),
  component: SignInPage,
});

// Pathless layout: everything below needs a session and renders inside the shell.
const appRoute = createRoute({ getParentRoute: () => rootRoute, id: "app", component: AppLayout });

const indexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
const dashboardRoute = createRoute({ getParentRoute: () => appRoute, path: "/dashboard", component: DashboardPage });

const booksRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/books",
  validateSearch: BookListQuerySchema,
  component: BooksPage,
});
const bookNewRoute = createRoute({ getParentRoute: () => appRoute, path: "/books/new", component: BookNewPage });
const bookDetailRoute = createRoute({ getParentRoute: () => appRoute, path: "/books/$bookId", component: BookDetailPage });
const bookEditRoute = createRoute({ getParentRoute: () => appRoute, path: "/books/$bookId/edit", component: BookEditPage });

// Sidebar targets built in later stories (members SLM-2, circulation SLM-4, loans SLM-5, discovery SLM-9, staff SLM-8).
const membersRoute = createRoute({ getParentRoute: () => appRoute, path: "/members", component: () => <ComingSoonPage title="Members" /> });
// Circulation (SLM-4): two tabs; /circulation → borrow.
const circulationRoute = createRoute({ getParentRoute: () => appRoute, path: "/circulation", component: CirculationLayout });
const circulationIndexRoute = createRoute({
  getParentRoute: () => circulationRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/circulation/borrow" });
  },
});
const borrowRoute = createRoute({ getParentRoute: () => circulationRoute, path: "/borrow", validateSearch: BorrowSearchSchema, component: BorrowPage });
const returnRoute = createRoute({ getParentRoute: () => circulationRoute, path: "/return", validateSearch: ReturnSearchSchema, component: ReturnPage });
const loansRoute = createRoute({ getParentRoute: () => appRoute, path: "/loans", validateSearch: LoanHistorySearchSchema, component: LoanHistoryPage });
const discoverRoute = createRoute({ getParentRoute: () => appRoute, path: "/discover", component: () => <ComingSoonPage title="Book discovery" /> });
const staffRoute = createRoute({ getParentRoute: () => appRoute, path: "/admin/users", component: () => <ComingSoonPage title="Staff users" /> });

const forbiddenRoute = createRoute({ getParentRoute: () => appRoute, path: "/403", component: ForbiddenPage });
const notFoundRoute = createRoute({ getParentRoute: () => appRoute, path: "/404", component: NotFoundPage });

const routeTree = rootRoute.addChildren([
  signInRoute,
  appRoute.addChildren([
    indexRoute,
    dashboardRoute,
    booksRoute,
    bookNewRoute,
    bookDetailRoute,
    bookEditRoute,
    membersRoute,
    circulationRoute.addChildren([circulationIndexRoute, borrowRoute, returnRoute]),
    loansRoute,
    discoverRoute,
    staffRoute,
    forbiddenRoute,
    notFoundRoute,
  ]),
]);

export const router = createRouter({
  routeTree,
  // Plain `?q=clean&page=2` URLs: values stay strings and the zod schemas coerce (TanStack's default
  // would turn q=2026 into a number and make it fail validation).
  parseSearch: (search) => Object.fromEntries(new URLSearchParams(search)),
  stringifySearch: (obj) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
    const s = p.toString();
    return s ? `?${s}` : "";
  },
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Session and permission failures from any query or mutation (ux.md §1).
setApiErrorHandler((err: ApiError) => {
  const here = router.state.location;
  if (err.status === 401) {
    if (here.pathname.startsWith("/signin")) return;
    // `expired` only when we had a session before; a first visit just goes to sign-in.
    const hadSession = queryClient.getQueryData(meQueryKey) !== undefined;
    queryClient.removeQueries({ queryKey: meQueryKey });
    void router.navigate({ to: "/signin", search: { next: here.href, ...(hadSession ? { expired: "1" } : {}) }, replace: true });
  } else if (err.code === "USER_DISABLED") {
    void queryClient.invalidateQueries({ queryKey: meQueryKey }); // the shell then shows "Your account is disabled"
  } else if (err.code === "FORBIDDEN") {
    if (here.pathname !== "/403") void router.navigate({ to: "/403", replace: true });
  }
});
