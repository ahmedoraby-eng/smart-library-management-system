// @vitest-environment jsdom
import { ROLE_PERMISSIONS, type Role } from "@slm/contracts";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../components/ui";
import { ApiError } from "../lib/apiClient";
import { queryClient } from "../lib/queryClient";
import { meQueryKey } from "../features/auth/session";
import { router } from "./router";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const problem = (status: number, code: string) => ({ type: "about:blank", title: code, status, code });
const summary = {
  kpis: {
    totalTitles: 1,
    totalCopies: 2,
    availableCopies: 2,
    borrowedCopies: 0,
    activeMembers: 1,
    inactiveMembers: 0,
    activeLoans: 0,
    overdueLoans: 0,
  },
  recentBorrowings: [],
  popularBooks: [],
  recentlyAdded: [],
};

/** `disabledOnce`: the next /me answer is USER_DISABLED, later ones are fine. `disabledAlways`: every /me answer is. */
const world: { role: Role | null; disabledOnce: boolean; disabledAlways: boolean } = {
  role: "LIBRARIAN",
  disabledOnce: false,
  disabledAlways: false,
};
let fetchMock: ReturnType<typeof vi.fn>;

function stubFetch() {
  fetchMock = vi.fn(async (url: string) => {
    if (url === "/api/me") {
      if (world.disabledAlways) return json(problem(403, "USER_DISABLED"), 403);
      if (world.disabledOnce) {
        world.disabledOnce = false;
        return json(problem(403, "USER_DISABLED"), 403);
      }
      if (!world.role) return json(problem(401, "UNAUTHENTICATED"), 401);
      return json({
        id: "u1",
        email: "ada@library.test",
        fullName: "Ada L",
        role: world.role,
        permissions: ROLE_PERMISSIONS[world.role],
        isDemo: false,
      });
    }
    if (url === "/api/dashboard/summary") return json(summary);
    if (url === "/api/auth/providers") return json({ google: false, demo: true });
    return json(problem(404, "NOT_FOUND"), 404);
  });
  vi.stubGlobal("fetch", fetchMock);
}
const meCalls = () => fetchMock.mock.calls.filter((c) => c[0] === "/api/me").length;

function mount() {
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}
/** Mounts the real app router and moves it to `path`. */
async function visit(path: string) {
  mount();
  await router.navigate({ href: path });
}
const path = () => router.state.location.pathname;
const search = () => router.state.location.search as Record<string, unknown>;
const apiError = (status: number, code: string) => new ApiError(problem(status, code) as never);
/** A request elsewhere in the app failing: goes through the shared query cache like any real one. */
const fail = (err: ApiError) =>
  queryClient
    .fetchQuery({ queryKey: ["probe", Math.random()], queryFn: () => Promise.reject(err), retry: false })
    .catch(() => undefined);

beforeEach(() => {
  world.role = "LIBRARIAN";
  world.disabledOnce = false;
  world.disabledAlways = false;
  stubFetch();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  queryClient.clear();
});

describe("routes", () => {
  it("the root path redirects to the dashboard, inside the shell", async () => {
    await visit("/");
    await waitFor(() => expect(path()).toBe("/dashboard"));
    expect(await screen.findByRole("navigation", { name: "Main" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("nav-dashboard")).toHaveAttribute("aria-current", "page"));
    expect(await screen.findByTestId("kpi-titles")).toHaveTextContent("1");
  });

  it("an unknown address ends on the in-app 404 page (replacing the bad entry)", async () => {
    await visit("/dashboard");
    await router.navigate({ href: "/no/such/page" });
    await waitFor(() => expect(path()).toBe("/404"));
    expect(await screen.findByTestId("not-found")).toHaveTextContent("Page not found");
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
  });

  it("/403 shows the access page", async () => {
    await visit("/403");
    expect(await screen.findByTestId("forbidden")).toHaveTextContent("You don't have access to this page");
  });

  it("/circulation goes straight to the borrow tab", async () => {
    await visit("/circulation");
    await waitFor(() => expect(path()).toBe("/circulation/borrow"));
  });

  it("a Librarian who deep-links to Staff users lands on /403", async () => {
    await visit("/admin/users");
    await waitFor(() => expect(path()).toBe("/403"));
    expect(await screen.findByTestId("forbidden")).toBeInTheDocument();
  });

  it("an Admin stays on Staff users", async () => {
    world.role = "ADMIN";
    await visit("/admin/users");
    expect(await screen.findByTestId("nav-admin-users")).toHaveAttribute("aria-current", "page");
    expect(path()).toBe("/admin/users");
  });

  it("sign-in is outside the shell and keeps next, error and expired in its search", async () => {
    world.role = null;
    await visit("/signin?next=%2Fbooks&error=google&expired=yes");
    expect(await screen.findByTestId("signin-card")).toBeInTheDocument();
    expect(search()).toEqual({ next: "/books", error: "google", expired: "yes" });
    expect(screen.queryByRole("navigation", { name: "Main" })).not.toBeInTheDocument();
  });

  it("previews links on intent", () => {
    expect(router.options.defaultPreload).toBe("intent");
  });
});

describe("search params in the URL", () => {
  const { parseSearch, stringifySearch } = router.options;

  it("parse keeps every value a string, so q=2026 stays text", () => {
    expect(parseSearch!("?q=2026&page=2&flag=true")).toEqual({ q: "2026", page: "2", flag: "true" });
    expect(parseSearch!("")).toEqual({});
  });

  it("stringify drops empty values and keeps zero and false", () => {
    expect(stringifySearch!({ q: "clean code", page: 2, a: undefined, b: null, c: "", z: 0, f: false })).toBe(
      "?q=clean+code&page=2&z=0&f=false",
    );
    expect(stringifySearch!({})).toBe("");
    expect(stringifySearch!({ q: "" })).toBe("");
  });

  it("a list URL keeps its filters as plain query text", async () => {
    await visit("/books?q=2026&page=2");
    await waitFor(() => expect(path()).toBe("/books"));
    expect(router.state.location.href).toContain("q=2026");
    expect(router.state.location.href).toContain("page=2");
    expect(String(search().q)).toBe("2026");
  });
});

describe("session and permission failures from any request", () => {
  it("401 with a session before: back to sign-in with next and expired", async () => {
    await visit("/books");
    await screen.findByTestId("nav-books");
    await waitFor(() => expect(queryClient.getQueryData(meQueryKey)).toBeDefined());
    world.role = null; // the server no longer knows the session
    await fail(apiError(401, "UNAUTHENTICATED"));
    await waitFor(() => expect(path()).toBe("/signin"));
    expect(search()).toMatchObject({ next: expect.stringContaining("/books"), expired: "1" });
    expect(queryClient.getQueryData(meQueryKey)).toBeUndefined();
  });

  it("401 on a first visit (no session ever): sign-in with next, but no 'session ended' note", async () => {
    world.role = null;
    await visit("/members");
    await waitFor(() => expect(path()).toBe("/signin"));
    expect(search()).toEqual({ next: expect.stringMatching(/^\/members/) });
    expect(await screen.findByTestId("signin-card")).toBeInTheDocument();
    expect(screen.queryByTestId("signin-expired")).not.toBeInTheDocument();
  });

  it("401 while already on sign-in changes nothing (no loop)", async () => {
    world.role = null;
    await visit("/signin");
    await screen.findByTestId("signin-card");
    await fail(apiError(401, "UNAUTHENTICATED"));
    expect(path()).toBe("/signin");
    expect(search()).toEqual({});
  });

  it("USER_DISABLED reloads the session (so the shell can show the disabled notice)", async () => {
    await visit("/dashboard");
    await screen.findByTestId("nav-dashboard");
    const before = meCalls();
    world.disabledOnce = true;
    await fail(apiError(403, "USER_DISABLED"));
    await waitFor(() => expect(meCalls()).toBeGreaterThan(before));
    expect(path()).toBe("/dashboard");
    expect(path()).not.toBe("/signin");
  });

  it("a disabled account whose /me keeps failing is not re-requested without end", async () => {
    await visit("/dashboard");
    await screen.findByTestId("nav-dashboard");
    world.disabledAlways = true;
    await fail(apiError(403, "USER_DISABLED"));
    await waitFor(() => expect(meCalls()).toBeGreaterThan(1));
    const settled = meCalls();
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(meCalls()).toBe(settled);
  });

  it("FORBIDDEN sends the visitor to /403, once", async () => {
    await visit("/dashboard");
    await screen.findByTestId("nav-dashboard");
    await fail(apiError(403, "FORBIDDEN"));
    await waitFor(() => expect(path()).toBe("/403"));
    const nav = vi.spyOn(router, "navigate");
    await fail(apiError(403, "FORBIDDEN"));
    expect(nav).not.toHaveBeenCalled();
  });

  it("other API errors are left to the screen that asked", async () => {
    await visit("/dashboard");
    await screen.findByTestId("nav-dashboard");
    const nav = vi.spyOn(router, "navigate");
    await fail(apiError(409, "CONFLICT"));
    await fail(apiError(500, "INTERNAL"));
    expect(nav).not.toHaveBeenCalled();
    expect(path()).toBe("/dashboard");
  });
});
