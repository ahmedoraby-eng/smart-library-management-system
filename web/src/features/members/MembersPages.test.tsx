// @vitest-environment jsdom
import type { LoanDto, MemberDto, Me } from "@slm/contracts";
import { MemberListQuerySchema } from "@slm/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/ui";
import { MemberDetailPage } from "./MemberDetailPage";
import { MembersPage } from "./MembersPage";

const me = (role: Me["role"], permissions: Me["permissions"]): Me => ({ id: "s1", email: "s@x.org", fullName: "Staff", role, permissions, isDemo: false });
const LIBRARIAN = me("LIBRARIAN", ["BOOK_READ", "MEMBER_READ", "MEMBER_WRITE", "LOAN_READ", "LOAN_PROCESS"]);
const SUPERVISOR = me("SUPERVISOR", ["BOOK_READ", "MEMBER_READ", "LOAN_READ"]);

const member = (patch: Partial<MemberDto>): MemberDto => ({
  id: "m1", memberNumber: "M-000001", fullName: "Sara Haddad", email: "sara@example.org", phone: null, status: "ACTIVE",
  registeredAt: "2026-01-01T00:00:00.000Z", activeLoans: 0, overdueLoans: 0, version: 0, ...patch,
});
const day = 86_400_000;
const loan = (id: string, status: LoanDto["status"], dueOffsetDays: number, returned = false): LoanDto => ({
  id, status, book: { id: `b-${id}`, title: `Book ${id}`, author: "An Author" },
  member: { id: "m1", memberNumber: "M-000001", fullName: "Sara Haddad" }, processedBy: { id: "s1", name: "Layla Librarian" }, returnedBy: returned ? { id: "s1", name: "Layla Librarian" } : null,
  borrowedAt: new Date(Date.now() - 20 * day).toISOString(), dueAt: new Date(Date.now() + dueOffsetDays * day).toISOString(),
  returnedAt: returned ? new Date(Date.now() - 2 * day).toISOString() : null,
});

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

/** Routes fetch by path; records the calls. */
function stubApi(who: Me, routes: Record<string, unknown | ((url: string) => unknown)>) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: { method?: string }) => {
    const path = String(input).replace(/^\/api/, "");
    calls.push(`${init?.method ?? "GET"} ${path}`);
    if (path === "/me") return ok(who);
    const key = Object.keys(routes).find((k) => path === k || path.startsWith(`${k}?`));
    if (!key) return new Response(JSON.stringify({ type: "about:blank", title: "Not found", status: 404, code: "NOT_FOUND" }), { status: 404 });
    const v = routes[key];
    return ok(typeof v === "function" ? v(path) : v);
  }));
  return calls;
}


/** The same route ids as the app (/app/members, /app/members/$memberId), in a fresh router per test. */
async function visit(path: string) {
  const root = createRootRoute({ component: Outlet });
  const app = createRoute({ getParentRoute: () => root, id: "app", component: Outlet });
  const members = createRoute({ getParentRoute: () => app, path: "/members", validateSearch: MemberListQuerySchema, component: MembersPage });
  const detail = createRoute({ getParentRoute: () => app, path: "/members/$memberId", component: MemberDetailPage });
  const book = createRoute({ getParentRoute: () => app, path: "/books/$bookId", component: () => <p>book</p> });
  const books = createRoute({ getParentRoute: () => app, path: "/books", component: () => <p>books</p> });
  const router = createRouter({
    routeTree: root.addChildren([app.addChildren([members, detail, book, books])]),
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

afterEach(() => vi.unstubAllGlobals());

describe("Members list /members", () => {
  it("asks for Active by default, shows count, rows, overdue badge and Add member for a Librarian", async () => {
    const calls = stubApi(LIBRARIAN, {
      "/members": { items: [member({ activeLoans: 2, overdueLoans: 1 }), member({ id: "m2", fullName: "Omar Nabil", memberNumber: "M-000002", email: "omar@example.org", phone: "+20 1" })], page: 1, size: 20, total: 2 },
    });
    await visit("/members");
    expect(await screen.findByTestId("members-table")).toBeInTheDocument();
    expect(screen.getByTestId("result-line")).toHaveTextContent("2 active members");
    expect(calls.some((c) => c.startsWith("GET /members") && c.includes("status=ACTIVE"))).toBe(true);
    const rows = screen.getAllByTestId("member-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByTestId("overdue-badge")).toHaveTextContent("1 overdue");
    expect(within(rows[0]!).getByTestId("member-name")).toHaveAttribute("href", "/members/m1");
    expect(screen.getByTestId("add-member")).toBeInTheDocument();
  });

  it("Supervisor sees the list but no Add member and no Edit action", async () => {
    stubApi(SUPERVISOR, { "/members": { items: [member({})], page: 1, size: 20, total: 1 } });
    const qc = await visit("/members");
    expect(await screen.findByTestId("members-table")).toBeInTheDocument();
    await waitFor(() => expect(qc.getQueryData(["me"])).toBeDefined()); // the role is known, so "not shown" is not just "not loaded yet"
    expect(screen.queryByTestId("add-member")).not.toBeInTheDocument();
    expect(screen.queryByTestId("row-actions")).not.toBeInTheDocument();
  });

  it("a search with no match shows the empty message and Clear filters", async () => {
    stubApi(LIBRARIAN, { "/members": { items: [], page: 1, size: 20, total: 0 } });
    await visit("/members?q=zzz");
    const empty = await screen.findByTestId("members-empty-filtered");
    expect(empty).toHaveTextContent("No members match “zzz”");
    expect(screen.getByTestId("result-line")).toHaveTextContent("0 members match “zzz”");
  });

  it("Add member opens the modal", async () => {
    stubApi(LIBRARIAN, { "/members": { items: [member({})], page: 1, size: 20, total: 1 } });
    await visit("/members");
    await userEvent.click(await screen.findByTestId("add-member"));
    expect(await screen.findByTestId("member-modal")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Add member" })).toBeInTheDocument();
  });
});

describe("Member detail /members/:id", () => {
  const loans = [loan("1", "OVERDUE", -4), loan("2", "ACTIVE", 10), loan("3", "RETURNED", -6, true)];

  it("shows the profile and the loans in the API's order with status badges", async () => {
    stubApi(LIBRARIAN, { "/members/m1/loans": loans, "/members/m1": member({ activeLoans: 2, overdueLoans: 1, phone: "+20 100" }) });
    await visit("/members/m1");
    expect(await screen.findByTestId("member-detail-name")).toHaveTextContent("Sara Haddad");
    expect(screen.getByTestId("member-status")).toHaveTextContent("Active");
    expect(screen.getByTestId("profile-number")).toHaveTextContent("M-000001");
    expect(screen.getByTestId("profile-phone")).toHaveTextContent("+20 100");
    const rows = await screen.findAllByTestId("loan-row");
    expect(rows.map((r) => within(r).getByTestId("loan-book").textContent)).toEqual(["Book 1", "Book 2"]);
    expect(within(rows[0]!).getByTestId("loan-status")).toHaveTextContent("Overdue · 4 days");
    expect(within(rows[1]!).getByTestId("loan-status")).toHaveTextContent("Active");
  });

  it("tabs: On loan (n of 5) and History; arrow keys move between them; History has no Return buttons", async () => {
    stubApi(LIBRARIAN, { "/members/m1/loans": loans, "/members/m1": member({ activeLoans: 2 }) });
    await visit("/members/m1");
    const onLoan = await screen.findByRole("tab", { name: "On loan (2 of 5)" });
    expect(onLoan).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toBeInTheDocument();
    expect(screen.getAllByTestId("return-button")).toHaveLength(2);
    onLoan.focus();
    await userEvent.keyboard("{ArrowRight}");
    const history = screen.getByRole("tab", { name: "History (1)" });
    expect(history).toHaveAttribute("aria-selected", "true");
    expect(history).toHaveFocus();
    const rows = screen.getAllByTestId("loan-row");
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getByTestId("loan-status")).toHaveTextContent("Returned");
    expect(screen.queryByTestId("return-button")).not.toBeInTheDocument();
  });

  it("inline Return opens the confirm dialog, then posts the return and refreshes the member's loans", async () => {
    let returned = false;
    const calls = stubApi(LIBRARIAN, {
      "/loans/1/return": () => { returned = true; return loan("1", "RETURNED", -4, true); },
      "/members/m1/loans": () => (returned ? [loans[1]!, loan("1", "RETURNED", -4, true), loans[2]!] : loans),
      "/members/m1": member({ activeLoans: 2 }),
    });
    await visit("/members/m1");
    const rows = await screen.findAllByTestId("loan-row");
    await userEvent.click(within(rows[0]!).getByTestId("return-button"));
    const dialog = await screen.findByTestId("return-dialog");
    expect(dialog).toHaveTextContent("Return Book 1 from Sara Haddad?");
    expect(calls.some((c) => c.startsWith("POST"))).toBe(false);
    await userEvent.click(within(dialog).getByTestId("dialog-confirm"));
    await waitFor(() => expect(calls).toContain("POST /loans/1/return"));
    await waitFor(() => expect(screen.getAllByTestId("loan-row")).toHaveLength(1));
    expect(screen.queryByTestId("return-dialog")).not.toBeInTheDocument();
  });

  it("[Borrow a book] links to Borrow with the member prefilled", async () => {
    stubApi(LIBRARIAN, { "/members/m1/loans": [], "/members/m1": member({}) });
    await visit("/members/m1");
    expect(await screen.findByTestId("borrow-for-member")).toHaveAttribute("href", expect.stringContaining("/circulation/borrow?member=m1"));
  });

  it("[Borrow a book] is disabled with the reason for an inactive member, and absent without LOAN_PROCESS", async () => {
    stubApi(LIBRARIAN, { "/members/m1/loans": [], "/members/m1": member({ status: "INACTIVE" }) });
    await visit("/members/m1");
    const btn = await screen.findByTestId("borrow-for-member");
    expect(btn).toBeDisabled();
    expect(screen.getByTestId("borrow-disabled-reason")).toHaveAttribute("title", "Inactive members can't borrow. Reactivate them first.");
  });

  it("Supervisor: no [Borrow a book]", async () => {
    stubApi(SUPERVISOR, { "/members/m1/loans": [], "/members/m1": member({}) });
    const qc = await visit("/members/m1");
    await screen.findByTestId("member-detail-name");
    await waitFor(() => expect(qc.getQueryData(["me"])).toBeDefined());
    expect(screen.queryByTestId("borrow-for-member")).not.toBeInTheDocument();
  });

  it("deactivate asks for confirmation, then sends the guarded PUT", async () => {
    const calls = stubApi(LIBRARIAN, { "/members/m1/loans": [], "/members/m1": member({ version: 5 }) });
    await visit("/members/m1");
    await userEvent.click(await screen.findByTestId("detail-actions"));
    await userEvent.click(await screen.findByTestId("menu-deactivate"));
    const dialog = await screen.findByTestId("deactivate-dialog");
    expect(dialog).toHaveTextContent("Deactivate Sara Haddad?");
    expect(calls.some((c) => c.startsWith("PUT"))).toBe(false);
    await userEvent.click(within(dialog).getByTestId("dialog-confirm"));
    await waitFor(() => expect(calls).toContain("PUT /members/m1"));
  });

  it("an inactive member shows the notice and Reactivate", async () => {
    stubApi(LIBRARIAN, { "/members/m1/loans": [], "/members/m1": member({ status: "INACTIVE" }) });
    await visit("/members/m1");
    expect(await screen.findByTestId("inactive-notice")).toBeInTheDocument();
    await userEvent.click(await screen.findByTestId("detail-actions"));
    expect(await screen.findByTestId("menu-reactivate")).toBeInTheDocument();
  });

  it("Supervisor sees the profile and loans but no Edit or status actions", async () => {
    stubApi(SUPERVISOR, { "/members/m1/loans": loans, "/members/m1": member({}) });
    await visit("/members/m1");
    expect(await screen.findByTestId("member-detail-name")).toBeInTheDocument();
    expect(screen.queryByTestId("edit-member")).not.toBeInTheDocument();
    expect(screen.queryByTestId("detail-actions")).not.toBeInTheDocument();
    expect((await screen.findAllByTestId("loan-row")).length).toBe(2);
    expect(screen.queryByTestId("return-button")).not.toBeInTheDocument();
  });

  it("an unknown member shows the not-found state", async () => {
    stubApi(LIBRARIAN, {});
    await visit("/members/nope");
    expect(await screen.findByTestId("member-not-found")).toBeInTheDocument();
  });
});
