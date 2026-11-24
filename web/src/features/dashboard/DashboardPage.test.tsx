// @vitest-environment jsdom
import { ROLE_PERMISSIONS, type DashboardSummary, type Role } from "@slm/contracts";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../test/render";
import { DashboardPage } from "./DashboardPage";
import { availabilitySegments, daysOverdue } from "./model";

const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();

const summary = (patch: Partial<DashboardSummary> = {}): DashboardSummary => ({
  kpis: { totalTitles: 128, totalCopies: 412, availableCopies: 341, borrowedCopies: 71, activeMembers: 54, inactiveMembers: 3, activeLoans: 71, overdueLoans: 6 },
  recentBorrowings: [
    { id: "l1", status: "ACTIVE", book: { id: "b1", title: "Dune", author: "Frank Herbert" }, member: { id: "m1", memberNumber: "M-000131", fullName: "Yasmin Adel" }, borrowedAt: iso(1), dueAt: iso(-13) },
    { id: "l2", status: "OVERDUE", book: { id: "b2", title: "Domain-Driven Design", author: "Eric Evans" }, member: { id: "m2", memberNumber: "M-000063", fullName: "Omar Nasser" }, borrowedAt: iso(17), dueAt: iso(3) },
    { id: "l3", status: "RETURNED", book: { id: "b3", title: "The Hobbit", author: "J.R.R. Tolkien" }, member: { id: "m3", memberNumber: "M-000071", fullName: "Karim Saleh" }, borrowedAt: iso(5), dueAt: iso(-9) },
  ],
  popularBooks: [{ id: "b4", title: "Clean Code", author: "R. Martin", coverImageUrl: null, totalCopies: 5, availableCopies: 3, nextDueAt: null, loansLast30Days: 11 }],
  recentlyAdded: [{ id: "b5", title: "Building Microservices", author: "S. Newman", coverImageUrl: null, totalCopies: 2, availableCopies: 2, nextDueAt: null, createdAt: iso(6) }],
  ...patch,
});

function stubApi(role: Role, dash: DashboardSummary | "error") {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (url === "/api/me") return json({ id: "u1", email: "x@y.test", fullName: "Test User", role, permissions: ROLE_PERMISSIONS[role], isDemo: false });
    if (url === "/api/admin/discovery/usage") return json({ day: "2026-11-25", searches: 14, neurons: 312.4, neuronCap: 8000, userQuota: 50, vectorPath: "hnsw" });
    if (url === "/api/dashboard/summary") return dash === "error" ? json({ type: "about:blank", title: "x", status: 500, code: "INTERNAL" }, 500) : json(dash);
    return json({}, 404);
  }));
}

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("SLM-12 dashboard page (ux.md §3.1)", () => {
  it("shows the four KPI cards, the availability bar and the recent borrowings with an overdue tint", async () => {
    stubApi("LIBRARIAN", summary());
    await renderWithProviders(<DashboardPage />);
    expect(await screen.findByTestId("kpi-titles")).toHaveTextContent("128");
    expect(screen.getByTestId("kpi-total-copies")).toHaveTextContent("412");
    expect(screen.getByTestId("kpi-available-copies")).toHaveTextContent("341");
    expect(screen.getByTestId("kpi-active-loans")).toHaveTextContent("71");
    expect(screen.getByTestId("kpi-overdue")).toHaveTextContent("6 overdue");
    expect(screen.getByTestId("view-overdue")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-active-members")).toHaveTextContent("54");
    expect(screen.getByTestId("kpi-inactive-members")).toHaveTextContent("3");
    expect(screen.getByTestId("availability-bar")).toHaveAccessibleName("341 available, 65 on loan, 6 overdue, of 412 copies");

    const rows = screen.getAllByTestId("recent-row");
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveAttribute("data-status", "OVERDUE");
    expect(rows[1]).toHaveClass("bg-overdue");
    expect(within(rows[1]!).getByText("Overdue · 3 days")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Active")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Returned")).toBeInTheDocument();
    expect(screen.getByTestId("popular-row")).toHaveTextContent("11 loans");
    expect(screen.getByTestId("added-row")).toHaveTextContent("Building Microservices");
  });

  it("Librarian sees Borrow and Return book actions; Supervisor sees neither and one dismissible notice", async () => {
    stubApi("LIBRARIAN", summary());
    const first = await renderWithProviders(<DashboardPage />);
    await screen.findByTestId("kpi-titles");
    expect(screen.getByTestId("dash-borrow")).toHaveAttribute("href", "/circulation/borrow");
    expect(screen.getByTestId("dash-return")).toHaveAttribute("href", "/circulation/return");
    expect(screen.queryByTestId("supervisor-notice")).not.toBeInTheDocument();
    first.unmount();

    stubApi("SUPERVISOR", summary());
    await renderWithProviders(<DashboardPage />);
    expect(await screen.findByTestId("supervisor-notice")).toHaveTextContent("read-only access (Supervisor)");
    expect(screen.queryByTestId("dash-borrow")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dash-return")).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId("dismiss-notice"));
    expect(screen.queryByTestId("supervisor-notice")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("slm.dashboard.supervisorNotice.dismissed")).toBe("1");
  });

  it("the Supervisor notice stays hidden once dismissed, and a broken localStorage does not crash", async () => {
    window.localStorage.setItem("slm.dashboard.supervisorNotice.dismissed", "1");
    stubApi("SUPERVISOR", summary());
    const r = await renderWithProviders(<DashboardPage />);
    await screen.findByTestId("kpi-titles");
    expect(screen.queryByTestId("supervisor-notice")).not.toBeInTheDocument();
    r.unmount();

    window.localStorage.clear();
    const broken = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
    const setBroken = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("denied"); });
    await renderWithProviders(<DashboardPage />);
    await userEvent.click(await screen.findByTestId("dismiss-notice"));
    expect(screen.queryByTestId("supervisor-notice")).not.toBeInTheDocument();
    broken.mockRestore();
    setBroken.mockRestore();
  });

  it("empty library: zero KPIs and an empty state with a Borrow action for staff who can borrow", async () => {
    stubApi("LIBRARIAN", summary({
      kpis: { totalTitles: 0, totalCopies: 0, availableCopies: 0, borrowedCopies: 0, activeMembers: 0, inactiveMembers: 0, activeLoans: 0, overdueLoans: 0 },
      recentBorrowings: [], popularBooks: [], recentlyAdded: [],
    }));
    await renderWithProviders(<DashboardPage />);
    expect(await screen.findByTestId("recent-empty")).toHaveTextContent("No loans yet");
    expect(screen.getByTestId("kpi-titles")).toHaveTextContent("0");
    expect(screen.getByTestId("kpi-overdue-none")).toBeInTheDocument();
    expect(screen.getByTestId("popular-empty")).toBeInTheDocument();
    expect(screen.getByTestId("added-empty")).toBeInTheDocument();
  });

  it("a failed load shows the error card with Try again", async () => {
    stubApi("LIBRARIAN", "error");
    await renderWithProviders(<DashboardPage />);
    expect(await screen.findByTestId("dashboard-error")).toHaveTextContent("Couldn't load the dashboard");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("dashboard model", () => {
  it("SLM-16: Admin sees today's AI usage against the cap", async () => {
    stubApi("ADMIN", summary());
    await renderWithProviders(<DashboardPage />);
    expect(await screen.findByTestId("ai-usage-today")).toHaveTextContent("AI usage today: 312 / 8,000 Neurons · 14 AI searches");
  });

  it("SLM-16: a Librarian sees no AI usage line and never calls the endpoint", async () => {
    stubApi("LIBRARIAN", summary());
    await renderWithProviders(<DashboardPage />);
    await screen.findAllByTestId("kpi-titles");
    expect(screen.queryByTestId("ai-usage-today")).toBeNull();
    const calls = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => c[0]);
    expect(calls).not.toContain("/api/admin/discovery/usage");
  });

  it("availability segments split on-loan into on-loan and overdue", () => {
    expect(availabilitySegments({ totalCopies: 412, availableCopies: 341, borrowedCopies: 71, overdueLoans: 6 })).toEqual({ available: 341, onLoan: 65, overdue: 6, total: 412 });
  });
  it("days overdue is at least 1", () => {
    const now = Date.parse("2026-11-24T12:00:00Z");
    expect(daysOverdue("2026-11-24T08:00:00Z", now)).toBe(1);
    expect(daysOverdue("2026-11-21T12:00:00Z", now)).toBe(3);
  });
});
