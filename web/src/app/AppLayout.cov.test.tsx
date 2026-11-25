// @vitest-environment jsdom
import { ROLE_PERMISSIONS, type Role } from "@slm/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ToastProvider } from "../components/ui";
import { meQueryKey } from "../features/auth/session";
import { AppLayout } from "./AppLayout";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const problem = (status: number, code: string) => ({ type: "about:blank", title: code, status, code });
const meBody = (role: Role, extra: Record<string, unknown> = {}) => ({
  id: "u1",
  email: "ada@library.test",
  fullName: "Ada Lovelace Byron",
  role,
  permissions: ROLE_PERMISSIONS[role],
  isDemo: false,
  ...extra,
});

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
function stubFetch(handler: Handler) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => handler(url, init));
  vi.stubGlobal("fetch", fn);
  return fn;
}
const callsTo = (fn: ReturnType<typeof stubFetch>, url: string) => fn.mock.calls.filter((c) => c[0] === url);

async function renderShell(path = "/dashboard", seed?: unknown) {
  const rootRoute = createRootRoute({ component: Outlet });
  const app = createRoute({ getParentRoute: () => rootRoute, id: "app", component: AppLayout });
  const page = (p: string) => createRoute({ getParentRoute: () => app, path: p, component: () => <p>page {p}</p> });
  const signIn = createRoute({
    getParentRoute: () => rootRoute,
    path: "/signin",
    validateSearch: z.object({ next: z.string().optional() }),
    component: () => <p>sign-in screen</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      signIn,
      app.addChildren(
        ["/dashboard", "/books", "/members", "/circulation", "/loans", "/discover", "/admin/users"].map(page),
      ),
    ]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (seed) queryClient.setQueryData(meQueryKey, seed);
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  await router.load();
  return { ...utils, router, queryClient };
}

afterEach(() => vi.unstubAllGlobals());

describe("AppLayout: loading and account errors", () => {
  it("shows a skeleton shell while the session loads", async () => {
    stubFetch(() => new Promise<Response>(() => undefined)); // never answers
    await renderShell();
    expect(await screen.findByTestId("shell-loading")).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("a disabled account sees only the notice, and Sign out ends the session", async () => {
    const fetchMock = stubFetch((url) => {
      if (url === "/api/me") return json(problem(403, "USER_DISABLED"), 403);
      if (url === "/api/auth/logout") return new Response(null, { status: 204 });
      return json({}, 404);
    });
    const { router } = await renderShell();
    const notice = await screen.findByTestId("account-disabled");
    expect(notice).toHaveTextContent("Your account is disabled");
    expect(notice).toHaveTextContent("Ask an Admin to reactivate it.");
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    await userEvent.click(within(notice).getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/signin"));
    expect(callsTo(fetchMock, "/api/auth/logout")[0]![1]).toMatchObject({ method: "POST" });
  });

  it("a 401 renders nothing (the router sends the visitor to sign-in)", async () => {
    stubFetch(() => json(problem(401, "UNAUTHENTICATED"), 401));
    await renderShell();
    await waitFor(() => expect(screen.queryByTestId("shell-loading")).not.toBeInTheDocument());
    // Only the (empty) toast region remains: no shell, no error message.
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("any other failure shows an error with Try again, which loads the account again", async () => {
    let attempt = 0;
    const fetchMock = stubFetch((url) => {
      if (url !== "/api/me") return json({}, 404);
      return ++attempt === 1 ? json(problem(500, "INTERNAL"), 500) : json(meBody("LIBRARIAN"));
    });
    await renderShell();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load your account. Check your connection and try again.");
    await userEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("navigation", { name: "Main" })).toBeInTheDocument();
    expect(callsTo(fetchMock, "/api/me")).toHaveLength(2);
  });

  it("a network failure is treated the same way (not as a sign-out)", async () => {
    stubFetch(() => {
      throw new TypeError("Failed to fetch");
    });
    const { router } = await renderShell();
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load your account");
    expect(router.state.location.pathname).toBe("/dashboard");
  });
});

describe("AppLayout: sidebar by role (U10)", () => {
  const labels = () =>
    within(screen.getByRole("navigation", { name: "Main" }))
      .getAllByRole("link")
      .map((a) => a.getAttribute("title"));

  it("Admin sees every item, with Staff users after a divider", async () => {
    stubFetch(() => json(meBody("ADMIN")));
    await renderShell();
    await screen.findByRole("navigation", { name: "Main" });
    expect(labels()).toEqual([
      "Dashboard",
      "Books",
      "Members",
      "Circulation",
      "Loan history",
      "Book discovery",
      "Staff users",
    ]);
    expect(screen.getByRole("separator")).toBeInTheDocument();
    expect(screen.getByTestId("nav-admin-users")).toHaveAttribute("href", "/admin/users");
  });

  it("Librarian has no Staff users and so no divider", async () => {
    stubFetch(() => json(meBody("LIBRARIAN")));
    await renderShell();
    await screen.findByRole("navigation", { name: "Main" });
    expect(labels()).toEqual(["Dashboard", "Books", "Members", "Circulation", "Loan history", "Book discovery"]);
    expect(screen.queryByTestId("nav-admin-users")).not.toBeInTheDocument();
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  });

  it("Supervisor (read-only) has no Circulation and no Staff users", async () => {
    stubFetch(() => json(meBody("SUPERVISOR")));
    await renderShell();
    await screen.findByRole("navigation", { name: "Main" });
    expect(labels()).not.toContain("Circulation");
    expect(labels()).not.toContain("Staff users");
    expect(screen.getByTestId("nav-books")).toBeInTheDocument();
  });

  it("hides an item when the role lacks its one permission, and shows items that need none", async () => {
    const perms = ROLE_PERMISSIONS.LIBRARIAN.filter((p) => p !== "AI_DISCOVER");
    stubFetch(() => json({ ...meBody("LIBRARIAN"), permissions: perms }));
    await renderShell();
    await screen.findByRole("navigation", { name: "Main" });
    expect(labels()).not.toContain("Book discovery");
    expect(labels()).toContain("Dashboard");
  });

  it("marks the current page and tags Book discovery with AI", async () => {
    stubFetch(() => json(meBody("LIBRARIAN")));
    await renderShell("/books");
    await screen.findByRole("navigation", { name: "Main" });
    expect(screen.getByTestId("nav-books")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("nav-dashboard")).not.toHaveAttribute("aria-current");
    expect(screen.getByTestId("nav-discover")).toHaveTextContent("AI");
    expect(screen.getByTestId("nav-books")).not.toHaveTextContent("AI");
    expect(await screen.findByText("page /books")).toBeInTheDocument();
  });

  it("clicking an item navigates and moves the current-page mark", async () => {
    stubFetch(() => json(meBody("LIBRARIAN")));
    const { router } = await renderShell("/dashboard");
    await userEvent.click(await screen.findByTestId("nav-members"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/members"));
    expect(screen.getByTestId("nav-members")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("nav-dashboard")).not.toHaveAttribute("aria-current");
  });

  it("puts the theme toggle and the page outlet in the main area", async () => {
    stubFetch(() => json(meBody("ADMIN")));
    await renderShell();
    const main = await screen.findByTestId("main");
    expect(within(main).getByTestId("theme-toggle")).toBeInTheDocument();
    expect(within(main).getByText("page /dashboard")).toBeInTheDocument();
  });
});

describe("AppLayout: user card", () => {
  it("shows initials, name, email and role; Supervisor's chip says read-only", async () => {
    stubFetch(() => json(meBody("SUPERVISOR")));
    await renderShell();
    const menu = await screen.findByTestId("user-menu");
    expect(menu).toHaveTextContent("AL"); // first two initials only
    expect(menu).toHaveTextContent("Ada Lovelace Byron");
    expect(menu).toHaveTextContent("ada@library.test");
    expect(menu).toHaveAttribute("title", "Ada Lovelace Byron · Supervisor");
    expect(screen.getByTestId("role-chip")).toHaveTextContent("Supervisor");
    expect(screen.getByTestId("role-chip")).toHaveAttribute("title", "Read-only");
    expect(screen.queryByText("Demo")).not.toBeInTheDocument();
  });

  it("other roles have no read-only hint; demo accounts carry a Demo tag; a one-word name gives one initial", async () => {
    stubFetch(() => json(meBody("ADMIN", { fullName: "madonna", isDemo: true })));
    await renderShell();
    const menu = await screen.findByTestId("user-menu");
    expect(menu).toHaveTextContent("M");
    expect(screen.getByTestId("role-chip")).toHaveTextContent("Admin");
    expect(screen.getByTestId("role-chip")).not.toHaveAttribute("title");
    expect(screen.getByText("Demo")).toBeInTheDocument();
  });

  it("opens a menu with Sign out focused, and Escape closes it", async () => {
    stubFetch(() => json(meBody("LIBRARIAN")));
    await renderShell();
    const button = await screen.findByTestId("user-menu");
    expect(button).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByTestId("sign-out")).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("a click outside closes the menu, a click inside does not; the button toggles it", async () => {
    stubFetch(() => json(meBody("LIBRARIAN")));
    await renderShell();
    const button = await screen.findByTestId("user-menu");
    await userEvent.click(button);
    fireEvent.mouseDown(screen.getByRole("menu"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId("main"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await userEvent.click(button);
    await userEvent.click(button);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("ignores keys other than Escape while the menu is open", async () => {
    stubFetch(() => json(meBody("LIBRARIAN")));
    await renderShell();
    await userEvent.click(await screen.findByTestId("user-menu"));
    await userEvent.keyboard("a");
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });
});

describe("AppLayout: signing out", () => {
  it("posts the logout, clears every cached query, goes to /signin and confirms with a toast", async () => {
    const fetchMock = stubFetch((url) =>
      url === "/api/auth/logout" ? new Response(null, { status: 204 }) : json(meBody("LIBRARIAN")),
    );
    const { router, queryClient } = await renderShell("/books");
    queryClient.setQueryData(["books", "list"], [{ id: "b1" }]);
    await userEvent.click(await screen.findByTestId("user-menu"));
    await userEvent.click(screen.getByTestId("sign-out"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/signin"));
    expect(callsTo(fetchMock, "/api/auth/logout")[0]![1]).toMatchObject({ method: "POST" });
    expect(queryClient.getQueryData(["books", "list"])).toBeUndefined();
    expect(await screen.findByText("You've signed out.")).toBeInTheDocument();
    expect(screen.getByText("sign-in screen")).toBeInTheDocument();
  });

  it("still ends the session on screen when the server call fails", async () => {
    stubFetch((url) => (url === "/api/auth/logout" ? json(problem(500, "INTERNAL"), 500) : json(meBody("LIBRARIAN"))));
    const { router } = await renderShell();
    await userEvent.click(await screen.findByTestId("user-menu"));
    await userEvent.click(screen.getByTestId("sign-out"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/signin"));
    expect(await screen.findByText("You've signed out.")).toBeInTheDocument();
  });

  it("disables Sign out while the request is in flight, so it cannot be sent twice", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const fetchMock = stubFetch(async (url) => {
      if (url === "/api/auth/logout") {
        await gate;
        return new Response(null, { status: 204 });
      }
      return json(meBody("LIBRARIAN"));
    });
    await renderShell();
    await userEvent.click(await screen.findByTestId("user-menu"));
    const signOut = screen.getByTestId("sign-out");
    await userEvent.click(signOut);
    await waitFor(() => expect(screen.getByTestId("sign-out")).toBeDisabled());
    await userEvent.click(screen.getByTestId("sign-out"));
    release();
    await screen.findByText("You've signed out.");
    expect(callsTo(fetchMock, "/api/auth/logout")).toHaveLength(1);
  });
});
