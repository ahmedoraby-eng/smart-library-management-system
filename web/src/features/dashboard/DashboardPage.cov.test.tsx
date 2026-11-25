// @vitest-environment jsdom
import { ROLE_PERMISSIONS, type DashboardSummary } from "@slm/contracts";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../test/render";
import { DashboardPage } from "./DashboardPage";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const problem = (status: number, code: string) => ({ type: "about:blank", title: code, status, code });
const summary: DashboardSummary = {
  kpis: {
    totalTitles: 7,
    totalCopies: 9,
    availableCopies: 9,
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

function stubApi(opts: { dashboard: () => Response; reindex?: () => Response }) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/me")
      return json({
        id: "u1",
        email: "a@b.test",
        fullName: "Admin",
        role: "ADMIN",
        permissions: ROLE_PERMISSIONS.ADMIN,
        isDemo: false,
      });
    if (url === "/api/dashboard/summary") return opts.dashboard();
    if (url === "/api/admin/discovery/usage")
      return json({ day: "2026-11-25", searches: 1, neurons: 10, neuronCap: 8000, userQuota: 50, vectorPath: "hnsw" });
    if (url === "/api/admin/discovery/reindex" && init?.method === "POST") return opts.reindex!();
    return json({}, 404);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("dashboard: retry after a failed load", () => {
  it("Try again asks the server again and then shows the numbers", async () => {
    let n = 0;
    const fn = stubApi({ dashboard: () => (++n === 1 ? json(problem(500, "INTERNAL"), 500) : json(summary)) });
    await renderWithProviders(<DashboardPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("kpi-titles")).toHaveTextContent("7");
    expect(screen.queryByTestId("dashboard-error")).not.toBeInTheDocument();
    expect(fn.mock.calls.filter((c) => c[0] === "/api/dashboard/summary")).toHaveLength(2);
  });
});

describe("dashboard: Rebuild search index edge cases (Admin)", () => {
  it("says so when search by meaning is not set up, and lets the Admin try later", async () => {
    stubApi({
      dashboard: () => json(summary),
      reindex: () =>
        json({ result: "disabled", embeddedBooks: 0, reusedBooks: 0, upToDate: 0, remaining: 0, total: 0 }),
    });
    await renderWithProviders(<DashboardPage />);
    await userEvent.click(await screen.findByTestId("rebuild-index"));
    expect(await screen.findByText("Search by meaning isn't set up on this server.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("rebuild-index")).toBeEnabled());
  });

  it("a server failure (not a rate limit) stops the rebuild with an error toast and a usable button", async () => {
    const fn = stubApi({ dashboard: () => json(summary), reindex: () => json(problem(500, "INTERNAL"), 500) });
    await renderWithProviders(<DashboardPage />);
    await userEvent.click(await screen.findByTestId("rebuild-index"));
    expect(await screen.findByText("Couldn't rebuild the search index. Try again.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("rebuild-index")).toBeEnabled());
    expect(fn.mock.calls.filter((c) => c[0] === "/api/admin/discovery/reindex")).toHaveLength(1);
  });

  it("an index that is already up to date finishes at once with a success toast", async () => {
    stubApi({
      dashboard: () => json(summary),
      reindex: () => json({ result: "done", embeddedBooks: 0, reusedBooks: 0, upToDate: 7, remaining: 0, total: 7 }),
    });
    await renderWithProviders(<DashboardPage />);
    await userEvent.click(await screen.findByTestId("rebuild-index"));
    expect(await screen.findByText("The search index is up to date.")).toBeInTheDocument();
  });
});
