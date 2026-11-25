// @vitest-environment jsdom
import type { Me, StaffUserDto } from "@slm/contracts";
import { StaffUserListQuerySchema } from "@slm/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/ui";
import { DEMO_PROTECTED, OWN_ROLE, StaffUsersPage } from "./StaffUsersPage";

const ADMIN: Me = {
  id: "s-admin",
  email: "amira@x.org",
  fullName: "Amira Admin",
  role: "ADMIN",
  isDemo: false,
  permissions: ["BOOK_READ", "STAFF_MANAGE"],
};

const user = (patch: Partial<StaffUserDto>): StaffUserDto => ({
  id: "s1",
  email: "nadia@x.org",
  fullName: "Nadia Karim",
  role: "SUPERVISOR",
  status: "ACTIVE",
  isDemo: false,
  createdAt: "2026-11-08T10:00:00.000Z",
  ...patch,
});
const USERS = [
  user({ id: "s-admin", fullName: "Amira Admin", email: "amira@x.org", role: "ADMIN" }),
  user({ id: "s-demo", fullName: "Demo Librarian", email: "librarian@demo.test", role: "LIBRARIAN", isDemo: true }),
  user({}),
  user({ id: "s2", fullName: "Omar Nasser", email: "omar@x.org", role: "LIBRARIAN" }),
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const problem = (status: number, code: string, detail?: string) =>
  json({ type: "about:blank", title: code, status, code, ...(detail ? { detail } : {}) }, status);

type Handler = (method: string, path: string, body: unknown) => Response | undefined;

/** /me, /auth/providers and /staff-users by default; `extra` handles the rest (PUT, reset). */
function stubApi(opts: { me?: Me; providers?: { google: boolean; demo: boolean } | null; extra?: Handler } = {}) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: { method?: string; body?: string }) => {
      const path = String(input).replace(/^\/api/, "");
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(init.body) : undefined;
      calls.push({ method, path, body });
      const r = opts.extra?.(method, path, body);
      if (r) return r;
      if (path === "/me") return json(opts.me ?? ADMIN);
      if (path === "/auth/providers")
        return opts.providers === null
          ? problem(404, "NOT_FOUND")
          : json(opts.providers ?? { google: true, demo: true });
      if (method === "GET" && path.startsWith("/staff-users"))
        return json({ items: USERS, page: 1, size: 20, total: USERS.length });
      return problem(404, "NOT_FOUND");
    }),
  );
  return calls;
}

async function visit(path = "/admin/users") {
  const root = createRootRoute({ component: Outlet });
  const app = createRoute({ getParentRoute: () => root, id: "app", component: Outlet });
  const staff = createRoute({
    getParentRoute: () => app,
    path: "/admin/users",
    validateSearch: StaffUserListQuerySchema,
    component: StaffUsersPage,
  });
  const router = createRouter({
    routeTree: root.addChildren([app.addChildren([staff])]),
    history: createMemoryHistory({ initialEntries: [path] }),
    parseSearch: (search) => Object.fromEntries(new URLSearchParams(search)),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  await router.load();
  return queryClient;
}

const rowOf = async (name: string) =>
  (await screen.findAllByTestId("staff-row")).find((r) => within(r).queryByText(name))!;

afterEach(() => vi.unstubAllGlobals());

describe("Staff users /admin/users (ux §3.7)", () => {
  it("lists rows with name, email, role, status and Added date; caption explains first sign-in", async () => {
    stubApi();
    await visit();
    const rows = await screen.findAllByTestId("staff-row");
    expect(rows).toHaveLength(4);
    expect(screen.getByTestId("staff-caption")).toHaveTextContent(
      "People appear here after their first Google sign-in.",
    );
    const nadia = await rowOf("Nadia Karim");
    expect(within(nadia).getByText("nadia@x.org")).toBeInTheDocument();
    expect(within(nadia).getByTestId("role-select")).toHaveValue("SUPERVISOR");
    expect(within(nadia).getByTestId("staff-status")).toHaveTextContent("Active");
    expect(within(nadia).getByText("8 Nov 2026")).toBeInTheDocument();
    expect(within(nadia).getByTestId("role-select")).toBeEnabled();
  });

  it("demo rows: lock icon, neutral Demo tag, controls disabled with the ux tooltip", async () => {
    stubApi();
    await visit();
    const demo = await rowOf("Demo Librarian");
    expect(within(demo).getByTestId("demo-lock")).toBeInTheDocument();
    expect(within(demo).getByTestId("demo-tag")).toHaveTextContent("Demo");
    expect(within(demo).getByTestId("role-select")).toBeDisabled();
    expect(within(demo).getByTestId("disable-user")).toBeDisabled();
    for (const tip of within(demo).getAllByTestId("control-tip")) expect(tip).toHaveAttribute("title", DEMO_PROTECTED);
    expect(within(await rowOf("Nadia Karim")).queryByTestId("demo-tag")).toBeNull();
  });

  it("own row: role select and Disable are disabled with tooltips", async () => {
    stubApi();
    await visit();
    const own = await rowOf("Amira Admin");
    expect(within(own).getByTestId("role-select")).toBeDisabled();
    expect(within(own).getByTestId("disable-user")).toBeDisabled();
    expect(within(own).getAllByTestId("control-tip")[0]).toHaveAttribute("title", OWN_ROLE);
  });

  it("role change: PUT {role, status} and toast 'Nadia Karim is now a Librarian.'", async () => {
    const calls = stubApi({
      extra: (m, p, b) => (m === "PUT" && p === "/staff-users/s1" ? json(user({ ...(b as object) })) : undefined),
    });
    await visit();
    await userEvent.selectOptions(within(await rowOf("Nadia Karim")).getByTestId("role-select"), "LIBRARIAN");
    expect(await screen.findByText("Nadia Karim is now a Librarian.")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "PUT")).toEqual({
      method: "PUT",
      path: "/staff-users/s1",
      body: { role: "LIBRARIAN", status: "ACTIVE" },
    });
  });

  it("409 PROTECTED_DEMO_ACCOUNT: toast the ux sentence and revert the select", async () => {
    stubApi({ extra: (m) => (m === "PUT" ? problem(409, "PROTECTED_DEMO_ACCOUNT", "server text") : undefined) });
    await visit();
    const select = within(await rowOf("Nadia Karim")).getByTestId("role-select");
    await userEvent.selectOptions(select, "ADMIN");
    expect(await screen.findByTestId("toast")).toHaveTextContent(DEMO_PROTECTED);
    expect(screen.getByTestId("toast")).toHaveAttribute("data-kind", "error");
    await waitFor(() => expect(select).toHaveValue("SUPERVISOR"));
  });

  it("Disable asks first, then PUTs status DISABLED", async () => {
    const calls = stubApi({
      extra: (m, p, b) =>
        m === "PUT" && p === "/staff-users/s2"
          ? json(user({ id: "s2", fullName: "Omar Nasser", ...(b as object) }))
          : undefined,
    });
    await visit();
    await userEvent.click(within(await rowOf("Omar Nasser")).getByTestId("disable-user"));
    const dialog = await screen.findByTestId("disable-dialog");
    expect(dialog).toHaveTextContent("Disable Omar Nasser?");
    expect(dialog).toHaveTextContent("They will be signed out of the app on their next request.");
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
    await userEvent.click(within(dialog).getByTestId("dialog-confirm"));
    await waitFor(() => expect(screen.queryByTestId("disable-dialog")).toBeNull());
    expect(calls.find((c) => c.method === "PUT")?.body).toEqual({ role: "LIBRARIAN", status: "DISABLED" });
  });

  it("Reset demo data: confirm dialog → POST /admin/reset-demo → toast and every query refetches", async () => {
    const calls = stubApi({
      extra: (m, p) => (m === "POST" && p === "/admin/reset-demo" ? json({ result: "reset" }) : undefined),
    });
    await visit();
    await screen.findAllByTestId("staff-row");
    const listCalls = () => calls.filter((c) => c.method === "GET" && c.path.startsWith("/staff-users")).length;
    const before = listCalls();
    await userEvent.click(screen.getByTestId("reset-demo"));
    const dialog = await screen.findByTestId("reset-dialog");
    expect(dialog).toHaveTextContent("Reset demo data?");
    expect(dialog).toHaveTextContent("Books, members and loans go back to the original demo set. Staff accounts stay.");
    await userEvent.click(within(dialog).getByTestId("dialog-confirm"));
    expect(await screen.findByText("Demo data reset.")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST" && c.path === "/admin/reset-demo")).toBe(true);
    await waitFor(() => expect(listCalls()).toBeGreaterThan(before));
    expect(screen.queryByTestId("reset-dialog")).toBeNull();
  });

  it("Reset demo data is hidden when demo sign-in is off (or the providers endpoint is missing) and the user isn't a demo account", async () => {
    stubApi({ providers: null });
    await visit();
    await screen.findAllByTestId("staff-row");
    expect(screen.queryByTestId("reset-demo")).toBeNull();
  });
});
